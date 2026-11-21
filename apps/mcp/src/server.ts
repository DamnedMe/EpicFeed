import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { LessonSourcesResponse } from '@study-feed/contracts';
import { lessonFeedDraftSchema } from '@study-feed/contracts';
import type { FeedIssue } from '@study-feed/core';
import { checkLessonFeed } from '@study-feed/core';
import { z } from 'zod';
import type { EpicFeedApi } from './api-client.js';
import { ApiRequestError } from './api-client.js';
import { GENERATION_INSTRUCTIONS, PROMPT_VERSION, SERVER_INSTRUCTIONS } from './prompt.js';

/** Versione del server MCP, mostrata a Claude Desktop. */
export const SERVER_VERSION = '0.1.0';

/** Operazioni dell'API usate dagli strumenti (sostituibili nei test). */
export type GenerationApi = Pick<EpicFeedApi, 'listLessons' | 'readLesson' | 'saveFeed'>;

/**
 * Crea il server MCP di EpicFeed con gli strumenti di generazione (M2):
 * `lezioni_da_generare`, `leggi_lezione`, `salva_feed_lezione`,
 * `stato_generazione` e il prompt `genera_lezioni`.
 *
 * Il server non tiene segreti oltre al token (dentro `api`) e ricorda solo,
 * in memoria, le parti delle lezioni lette, per controllare il feed prima di
 * inviarlo.
 *
 * @param api - Client dell'API di EpicFeed.
 * @returns Il server, da collegare a un trasporto (stdio in produzione).
 */
export function createEpicFeedServer(api: GenerationApi): McpServer {
  const server = new McpServer(
    { name: 'epicfeed', title: 'EpicFeed', version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  // Parti di ogni lezione letta in questa sessione: servono al controllo locale.
  const partsByLesson = new Map<string, ReadonlySet<string>>();

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
        'Restituisce le fonti di una lezione (riassunti in italiano e inglese, testi di lettura, glossario della materia), la sua impronta (sourcesHash) e le istruzioni per crearne il feed. Da chiamare prima di salva_feed_lezione.',
      inputSchema: {
        lessonId: z.uuid().describe('Id della lezione, da lezioni_da_generare.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lessonId }) =>
      withErrors(async () => {
        const lesson = await api.readLesson(lessonId);
        partsByLesson.set(lesson.lessonId, new Set(lesson.parts.map((part) => part.lessonPartId)));
        return text(`${formatLesson(lesson)}\n\n---\n\n${GENERATION_INSTRUCTIONS}`);
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
    } else {
      out.push('Tipo: testo di lettura (origin "reading")', '', part.content.markdown);
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

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function issuesResult(issues: readonly FeedIssue[]): CallToolResult {
  const list = issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n');
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Il feed non è stato salvato: ${String(issues.length)} problemi da correggere.\n${list}\nCorreggi solo questi punti e chiama di nuovo salva_feed_lezione.`,
      },
    ],
  };
}

/** Trasforma gli errori dell'API in risultati leggibili per Claude. */
async function withErrors(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.issues.length > 0) return issuesResult(error.issues);
      const hint =
        error.code === 'UNAUTHORIZED'
          ? ' Crea un nuovo token nella pagina Claude Desktop di EpicFeed e incollalo nelle impostazioni dell’estensione.'
          : error.code === 'CONFLICT'
            ? ' Chiama di nuovo leggi_lezione e rigenera il feed dalle fonti aggiornate.'
            : '';
      return { isError: true, content: [{ type: 'text', text: `${error.message}${hint}` }] };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: 'Errore inatteso nel server MCP di EpicFeed.' }],
    };
  }
}
