import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LessonSourcesResponse } from '@epicfeed/contracts';
import { lessonFeedDraftSchema } from '@epicfeed/contracts';
import { checkLessonFeed } from '@epicfeed/core';
import * as z from 'zod';
import type { EpicFeedApi } from './api-client.js';
import { ApiRequestError } from './api-client.js';
import { CORRECTION_SERVER_INSTRUCTIONS } from './correction-prompt.js';
import type { CorrectionApi } from './correction-tools.js';
import { registerCorrectionTools } from './correction-tools.js';
import { EXAM_SERVER_INSTRUCTIONS } from './exam-prompt.js';
import type { ExamBankApi } from './exam-bank-tools.js';
import { registerExamBankTools } from './exam-bank-tools.js';
import type { ExamApi } from './exam-tools.js';
import { registerExamTools } from './exam-tools.js';
import { GENERATION_INSTRUCTIONS, PROMPT_VERSION, SERVER_INSTRUCTIONS } from './prompt.js';
import type { SlidesToolkit } from './slides/toolkit.js';
import { defaultSlidesToolkit } from './slides/toolkit.js';
import { importSlides, newImportSession, slideImagesFor } from './slides/tools.js';
import { issuesResult, text, withErrors } from './tool-results.js';

/** Versione del server MCP, mostrata a Claude Desktop. */
export const SERVER_VERSION = '0.1.0';

/** Operazioni dell'API usate dagli strumenti (sostituibili nei test). */
export type GenerationApi = Pick<
  EpicFeedApi,
  'listLessons' | 'readLesson' | 'saveFeed' | 'listCatalog' | 'importSlides'
> &
  ExamApi &
  ExamBankApi &
  CorrectionApi;

/**
 * Crea il server MCP di EpicFeed con gli strumenti di generazione (M2):
 * `lezioni_da_generare`, `leggi_lezione`, `salva_feed_lezione`,
 * `stato_generazione`, `importa_slide` e il prompt `genera_lezioni`; più
 * quelli dei pacchetti d'esame e della banca degli esercizi (M4,
 * {@link registerExamTools}, {@link registerExamBankTools}) e della
 * correzione delle risposte ({@link registerCorrectionTools}).
 *
 * Il server non tiene segreti oltre al token (dentro `api`) e ricorda solo,
 * in memoria, le parti delle lezioni lette, per controllare il feed prima di
 * inviarlo.
 *
 * @param api - Client dell'API di EpicFeed.
 * @param slides - Operazioni sui PDF delle slide (sostituibili nei test).
 * @returns Il server, da collegare a un trasporto (stdio in produzione).
 */
export function createEpicFeedServer(
  api: GenerationApi,
  slides: SlidesToolkit = defaultSlidesToolkit(),
): McpServer {
  const server = new McpServer(
    { name: 'epicfeed', title: 'EpicFeed', version: SERVER_VERSION },
    {
      instructions: `${SERVER_INSTRUCTIONS}\n\n${EXAM_SERVER_INSTRUCTIONS}\n${CORRECTION_SERVER_INSTRUCTIONS}`,
    },
  );
  // Parti di ogni lezione letta in questa sessione: servono al controllo locale.
  const partsByLesson = new Map<string, ReadonlySet<string>>();
  // Lezioni le cui slide sono già state importate in questa sessione (per riprendere).
  const slidesSession = newImportSession();

  server.registerTool(
    'lezioni_da_generare',
    {
      title: 'Lezioni da generare',
      description:
        'Elenca le lezioni EpicFeed importate dallo studente che non hanno ancora schede e quiz, con i totali. È il primo passo quando lo studente chiede di generare le lezioni.',
      inputSchema: {
        limite: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Quante lezioni elencare al massimo (predefinito 20).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limite }) =>
      withErrors(async () => {
        const result = await api.listLessons(limite ?? 20);
        const { totals } = result;
        const lines = [
          `Lezioni importate: ${String(totals.lessons)} · pronte: ${String(totals.ready)} · da generare: ${String(totals.toGenerate)}.`,
        ];
        if (result.lessons.length === 0) {
          lines.push('Non ci sono lezioni da generare.');
        } else {
          lines.push('', 'Da generare, in ordine di studio:');
          for (const lesson of result.lessons) {
            lines.push(
              `- ${lesson.subjectTitle} › ${lesson.chapterTitle} › ${lesson.lessonTitle} (${String(lesson.partCount)} parti) — lessonId: ${lesson.lessonId}`,
            );
          }
          if (totals.toGenerate > result.lessons.length) {
            lines.push(
              `… e altre ${String(totals.toGenerate - result.lessons.length)}: richiama lo strumento dopo averle generate.`,
            );
          }
        }
        return text(lines.join('\n'));
      }),
  );

  server.registerTool(
    'leggi_lezione',
    {
      title: 'Leggi lezione',
      description:
        'Restituisce le fonti di una lezione (riassunti in italiano e inglese, testi di lettura, testo e immagini delle slide, glossario della materia), la sua impronta (sourcesHash) e le istruzioni per crearne il feed. Da chiamare prima di salva_feed_lezione.',
      inputSchema: {
        lessonId: z.uuid().describe('Id della lezione, da lezioni_da_generare.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lessonId }) =>
      withErrors(async () => {
        const lesson = await api.readLesson(lessonId);
        partsByLesson.set(lesson.lessonId, new Set(lesson.parts.map((part) => part.lessonPartId)));
        const { images, note } = await slideImagesFor(lesson, slides);
        const content: CallToolResult['content'] = [{ type: 'text', text: formatLesson(lesson) }];
        if (note) content.push({ type: 'text', text: note });
        for (const image of images) {
          content.push({ type: 'text', text: `Figura: ${image.label}` });
          content.push({
            type: 'image',
            data: image.png.toString('base64'),
            mimeType: 'image/png',
          });
        }
        content.push({ type: 'text', text: GENERATION_INSTRUCTIONS });
        return { content };
      }),
  );

  server.registerTool(
    'salva_feed_lezione',
    {
      title: 'Salva feed della lezione',
      description:
        'Salva in EpicFeed il feed di una lezione (schede, quiz, concetti e glossario, ogni testo in it ed en). Controlla il feed prima di inviarlo: se ci sono problemi li elenca, da correggere prima di salvare di nuovo.',
      inputSchema: {
        lessonId: z.uuid().describe('Id della lezione, come in leggi_lezione.'),
        sourcesHash: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .describe('Impronta delle fonti restituita da leggi_lezione.'),
        feed: lessonFeedDraftSchema.describe('Il feed della lezione.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId, sourcesHash, feed }) =>
      withErrors(async () => {
        // Controllo locale: stesse regole dell'API, risposta immediata e
        // nessuna chiamata sprecata per un feed da correggere.
        const known = partsByLesson.get(lessonId.toLowerCase());
        const partIds = known ?? new Set(feed.cards.map((card) => card.sourcePartId));
        const issues = checkLessonFeed(feed, { partIds });
        if (issues.length > 0) return issuesResult(issues);

        const saved = await api.saveFeed({
          lessonId,
          sourcesHash,
          promptVersion: PROMPT_VERSION,
          feed,
        });
        const verb = saved.created
          ? 'Feed salvato'
          : 'Questa lezione aveva già un feed (vale il primo)';
        return text(
          `${verb}: ${String(saved.cards)} schede, ${String(feed.quiz.length)} domande, ${String(feed.concepts.length)} concetti. Minuto del video trovato per ${String(saved.alignedCards)} schede su ${String(saved.cards)}.`,
        );
      }),
  );

  server.registerTool(
    'stato_generazione',
    {
      title: 'Stato della generazione',
      description: 'Quante lezioni importate sono pronte e quante restano da generare.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      withErrors(async () => {
        const { totals } = await api.listLessons(1);
        return text(
          `Lezioni importate: ${String(totals.lessons)} · pronte: ${String(totals.ready)} · da generare: ${String(totals.toGenerate)}.`,
        );
      }),
  );

  server.registerTool(
    'importa_slide',
    {
      title: 'Importa slide',
      description:
        'Importa le slide delle lezioni dallo zip "Download all PDFs" della pagina Course downloads del portale (o dalla cartella in cui è estratto). Abbina ogni PDF alla sua lezione già importata, legge il testo sul PC e lo invia a EpicFeed; i PDF restano sul PC.',
      inputSchema: {
        percorso: z
          .string()
          .min(1)
          .max(1024)
          .describe(
            'Percorso dello zip o della cartella sul PC, es. C:\\Users\\…\\Downloads\\slides.zip',
          ),
        materia: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Materia a cui limitare l’abbinamento, se due materie hanno lezioni con lo stesso titolo. Le omonime nello stesso corso si distinguono da sole con l’ordine dello zip.',
          ),
        aggiorna: z
          .boolean()
          .optional()
          .describe('Rilegge anche le lezioni che hanno già le slide (zip aggiornato).'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ percorso, materia, aggiorna }, extra) =>
      withErrors(async () => {
        const progressToken = extra._meta?.progressToken;
        try {
          const outcome = await importSlides(api, slides, slidesSession, {
            path: percorso.trim(),
            subject: materia,
            refresh: aggiorna,
            onProgress:
              progressToken === undefined
                ? undefined
                : (progress, total) =>
                    extra.sendNotification({
                      method: 'notifications/progress',
                      params: { progressToken, progress, total },
                    }),
          });
          return { isError: outcome.isError, content: [{ type: 'text', text: outcome.text }] };
        } catch (error) {
          if (error instanceof ApiRequestError) throw error;
          // Errori dei file (percorso inesistente, zip rovinato): messaggio già leggibile.
          const message =
            error instanceof Error ? error.message : 'Errore nella lettura delle slide.';
          return { isError: true, content: [{ type: 'text', text: message }] };
        }
      }),
  );

  server.registerPrompt(
    'genera_lezioni',
    {
      title: 'Genera le lezioni nuove',
      description:
        'Genera schede, quiz e concetti per tutte le lezioni EpicFeed ancora da generare.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Genera il feed di tutte le lezioni EpicFeed ancora da generare, una alla volta, con gli strumenti di EpicFeed.\n\n${GENERATION_INSTRUCTIONS}`,
          },
        },
      ],
    }),
  );

  registerExamTools(server, api);
  registerExamBankTools(server, api, slides);
  registerCorrectionTools(server, api);
  return server;
}

/**
 * Fonti di una lezione in testo leggibile per Claude: intestazione con gli id
 * da riusare al salvataggio, poi ogni parte con i riassunti nelle due lingue o
 * il testo di lettura, poi il glossario della materia.
 *
 * @param lesson - Risposta di `leggi_lezione`.
 * @returns Il testo.
 */
export function formatLesson(lesson: LessonSourcesResponse): string {
  const out = [
    `# ${lesson.lessonTitle}`,
    `Materia: ${lesson.subjectTitle} · Capitolo: ${lesson.chapterTitle}`,
    `lessonId: ${lesson.lessonId}`,
    `sourcesHash: ${lesson.sourcesHash}`,
  ];
  for (const part of lesson.parts) {
    out.push(
      '',
      `## Parte ${String(part.position)}: ${part.title}`,
      `sourcePartId: ${part.lessonPartId}`,
    );
    if (part.content.kind === 'video') {
      out.push(
        `Tipo: video${part.hasSubtitles ? ' (con sottotitoli: il minuto lo calcola EpicFeed)' : ''}`,
      );
      const { it, en } = part.content.summaries;
      out.push(
        '',
        '### Riassunto (it)',
        it ?? '(mancante)',
        '',
        '### Summary (en)',
        en ?? '(missing)',
      );
    } else if (part.content.kind === 'reading') {
      out.push('Tipo: testo di lettura (origin "reading")', '', part.content.markdown);
    } else {
      out.push(`Tipo: slide (origin "slides"), file ${part.content.fileName}`);
      for (const page of part.content.pages) {
        out.push('', `### Pagina ${String(page.number)}`, page.text || '(solo figura)');
      }
    }
  }
  out.push('', '## Glossario della materia');
  if (lesson.glossary.length === 0) {
    out.push('(ancora vuoto)');
  } else {
    for (const entry of lesson.glossary) out.push(`- ${entry.term} — ${entry.translation}`);
  }
  return out.join('\n');
}
