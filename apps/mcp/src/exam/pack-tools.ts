import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LessonForExamResponse, ExamPackCheckContext } from '@epicfeed/exam';
import { examPackDraftSchema, checkExamPack } from '@epicfeed/exam';
import * as z from 'zod';
import type { EpicFeedApi } from '../api-client.js';
import { EXAM_INSTRUCTIONS, EXAM_PROMPT_VERSION } from './prompt.js';
import { issuesResult, text, withErrors } from '../tool-results.js';

/** Operazioni dell'API usate dagli strumenti d'esame (sostituibili nei test). */
export type ExamApi = Pick<EpicFeedApi, 'listExamLessons' | 'readLessonForExam' | 'saveExamPack'>;

/** Strumento da richiamare dopo aver corretto un pacchetto. */
const SAVE_TOOL = 'salva_domande_esame';

/**
 * Registra gli strumenti dei pacchetti d'esame (M4): `lezioni_per_esame`,
 * `leggi_lezione_esame`, `salva_domande_esame` e il prompt
 * `genera_domande_esame`.
 *
 * Come per il feed, il server ricorda in memoria il feed di ogni lezione letta
 * e controlla il pacchetto con le regole del dominio prima di inviarlo.
 *
 * @param server - Server MCP di EpicFeed.
 * @param api - Client dell'API.
 */
export function registerExamTools(server: McpServer, api: ExamApi): void {
  // Concetti e domande del feed di ogni lezione letta in questa sessione.
  const contextByFeed = new Map<string, ExamPackCheckContext>();

  server.registerTool(
    'lezioni_per_esame',
    {
      title: "Lezioni per l'esame",
      description:
        "Elenca le lezioni EpicFeed che hanno il feed ma non ancora le domande d'esame (10 domande a scelta multipla in più e 1-2 domande aperte in inglese), con i totali.",
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
        const result = await api.listExamLessons(limite ?? 20);
        const { totals } = result;
        const lines = [
          `Lezioni con il feed: ${String(totals.lessons)} · con le domande d'esame: ${String(totals.ready)} · da completare: ${String(totals.toGenerate)}.`,
        ];
        if (result.lessons.length === 0) {
          lines.push("Non ci sono lezioni a cui mancano le domande d'esame.");
        } else {
          lines.push('', 'Da completare, in ordine di studio:');
          for (const lesson of result.lessons) {
            lines.push(
              `- ${lesson.subjectTitle} › ${lesson.chapterTitle} › ${lesson.lessonTitle} — lessonId: ${lesson.lessonId}`,
            );
          }
          if (totals.toGenerate > result.lessons.length) {
            lines.push(
              `… e altre ${String(totals.toGenerate - result.lessons.length)}: richiama lo strumento dopo averle completate.`,
            );
          }
        }
        return text(lines.join('\n'));
      }, SAVE_TOOL),
  );

  server.registerTool(
    'leggi_lezione_esame',
    {
      title: "Leggi lezione per l'esame",
      description:
        "Restituisce il feed di una lezione in inglese (concetti, schede, domande già presenti), il suo feedId e le istruzioni per scrivere le domande d'esame. Da chiamare prima di salva_domande_esame.",
      inputSchema: {
        lessonId: z.uuid().describe('Id della lezione, da lezioni_per_esame.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lessonId }) =>
      withErrors(async () => {
        const lesson = await api.readLessonForExam(lessonId);
        contextByFeed.set(lesson.feedId, {
          conceptKeys: new Set(lesson.concepts.map((concept) => concept.key)),
          feedQuestions: lesson.feedQuestions,
        });
        return {
          content: [
            { type: 'text', text: formatLessonForExam(lesson) },
            { type: 'text', text: EXAM_INSTRUCTIONS },
          ],
        };
      }, SAVE_TOOL),
  );

  server.registerTool(
    'salva_domande_esame',
    {
      title: "Salva domande d'esame",
      description:
        "Salva in EpicFeed il pacchetto d'esame di una lezione (domande a scelta multipla e domande aperte, in inglese). Controlla il pacchetto prima di inviarlo: se ci sono problemi li elenca, da correggere prima di salvare di nuovo.",
      inputSchema: {
        lessonId: z.uuid().describe('Id della lezione, come in leggi_lezione_esame.'),
        feedId: z.uuid().describe('Id del feed restituito da leggi_lezione_esame.'),
        pack: examPackDraftSchema.describe("Il pacchetto d'esame."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lessonId, feedId, pack }) =>
      withErrors(async () => {
        // Controllo locale con le stesse regole dell'API, se il feed è stato
        // letto in questa sessione; altrimenti controlla solo l'API.
        const context = contextByFeed.get(feedId.toLowerCase());
        if (context) {
          const issues = checkExamPack(pack, context);
          if (issues.length > 0) return issuesResult(issues, SAVE_TOOL);
        }
        const saved = await api.saveExamPack({
          lessonId,
          feedId,
          promptVersion: EXAM_PROMPT_VERSION,
          pack,
        });
        const verb = saved.created
          ? "Domande d'esame salvate"
          : "Questa lezione aveva già le domande d'esame (vale il primo pacchetto)";
        return text(
          `${verb}: ${String(saved.questions)} a scelta multipla e ${String(saved.openQuestions)} aperte.`,
        );
      }, SAVE_TOOL),
  );

  server.registerPrompt(
    'genera_domande_esame',
    {
      title: "Genera le domande d'esame",
      description:
        "Scrive le domande d'esame in inglese (scelta multipla e aperte) per tutte le lezioni EpicFeed che hanno il feed.",
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Scrivi le domande d'esame di tutte le lezioni EpicFeed che non le hanno ancora, una lezione alla volta, con gli strumenti di EpicFeed.\n\n${EXAM_INSTRUCTIONS}`,
          },
        },
      ],
    }),
  );
}

/**
 * Feed di una lezione in testo leggibile per Claude: intestazione con gli id
 * da riusare al salvataggio, concetti, schede e domande già presenti.
 *
 * @param lesson - Risposta di `leggi_lezione_esame`.
 * @returns Il testo.
 */
export function formatLessonForExam(lesson: LessonForExamResponse): string {
  const out = [
    `# ${lesson.lessonTitle}`,
    `Materia: ${lesson.subjectTitle} · Capitolo: ${lesson.chapterTitle}`,
    `lessonId: ${lesson.lessonId}`,
    `feedId: ${lesson.feedId}`,
  ];
  if (lesson.hasExamPack) {
    out.push("Nota: questa lezione ha già le domande d'esame; salvarne altre non cambia nulla.");
  }
  out.push('', '## Concetti');
  for (const concept of lesson.concepts) {
    out.push(`- ${concept.key}: ${concept.name}. ${concept.description}`);
  }
  out.push('', '## Schede');
  for (const card of lesson.cards) {
    out.push('', `### ${card.title}`, `Key point: ${card.keyPoint}`, card.body);
    if (card.steps) out.push(...card.steps.map((step, i) => `${String(i + 1)}. ${step}`));
    if (card.code) out.push('```' + card.code.language, card.code.source, '```');
    out.push(`Concetti: ${card.conceptKeys.join(', ') || '-'}`);
  }
  out.push('', '## Domande già nel feed (non ripeterle)');
  out.push(...lesson.feedQuestions.map((question) => `- ${question}`));
  return out.join('\n');
}
