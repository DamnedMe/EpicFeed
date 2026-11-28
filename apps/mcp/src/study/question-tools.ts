import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StoredQuestion } from '@epicfeed/assistant';
import { QUESTION_LIMITS } from '@epicfeed/assistant';
import * as z from 'zod';
import type { EpicFeedApi } from '../api-client.js';
import { text, withErrors } from '../tool-results.js';
import type { StudyLibrary, SubjectFeed } from './library.js';

/** Operazioni dell'API usate dalle domande in coda (sostituibili nei test). */
export type QuestionApi = Pick<EpicFeedApi, 'listPendingQuestions' | 'answerQuestion'>;

const ANSWER_TOOL = 'rispondi_domanda';

/** Istruzioni per rispondere alle domande in coda. */
export const QUESTION_INSTRUCTIONS = `Rispondi a ciascuna domanda con ${ANSWER_TOOL}, una alla volta:
- parti dalla scheda riportata e, se serve, cerca altro con cerca_lezione;
- rispondi nella lingua della domanda, in breve (al massimo circa 200 parole), con Markdown semplice: paragrafi, elenchi, codice;
- cita la lezione e, se c'è, il minuto del video;
- se la domanda va oltre le lezioni, rispondi con quello che sai e dillo;
- dopo averle salvate, riassumi allo studente in chat a cosa hai risposto: le risposte le ritrova nell'app in Io › Le mie domande.`;

/**
 * Registra gli strumenti delle domande in coda (M6, ADR 0021, scelta 1):
 * `domande_in_attesa`, `rispondi_domanda` e il prompt `rispondi_domande`.
 *
 * @param server - Server MCP di EpicFeed.
 * @param services - API e libreria delle materie (per mostrare la scheda).
 */
export function registerQuestionTools(
  server: McpServer,
  services: { readonly api: QuestionApi; readonly library: StudyLibrary },
): void {
  server.registerTool(
    'domande_in_attesa',
    {
      title: 'Domande in attesa',
      description:
        "Elenca le domande che lo studente ha messo in coda dall'app con Chiedi a Claude (senza chiave API), ciascuna con la scheda su cui l'ha fatta. Da chiamare prima di rispondi_domanda.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      withErrors(async () => {
        const questions = await services.api.listPendingQuestions();
        if (questions.length === 0) {
          return text(
            "Non ci sono domande in attesa. Lo studente le fa nell'app: tieni premuto su una scheda, Chiedi a Claude, Metti in coda.",
          );
        }
        const parts: string[] = [];
        for (const question of questions) {
          const feed = await services.library.feed(question.subjectId).catch(() => null);
          parts.push(formatQuestion(question, feed));
        }
        if (questions.length >= QUESTION_LIMITS.batch) {
          parts.push(
            'Potrebbero essercene altre: richiama lo strumento dopo aver risposto a queste.',
          );
        }
        parts.push(QUESTION_INSTRUCTIONS);
        return { content: parts.map((value) => ({ type: 'text' as const, text: value })) };
      }, ANSWER_TOOL),
  );

  server.registerTool(
    ANSWER_TOOL,
    {
      title: 'Rispondi a una domanda',
      description:
        "Salva la risposta a una domanda in coda: lo studente la legge nell'app, in Io › Le mie domande. Una risposta per domanda; non si può cambiare dopo.",
      inputSchema: {
        id: z.uuid().describe('Id della domanda, da domande_in_attesa.'),
        risposta: z
          .string()
          .trim()
          .min(1)
          .max(QUESTION_LIMITS.answer)
          .describe('Risposta in Markdown semplice, nella lingua della domanda.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ id, risposta }) =>
      withErrors(async () => {
        await services.api.answerQuestion(id, risposta);
        return text("Risposta salvata: lo studente la trova nell'app in Io › Le mie domande.");
      }, ANSWER_TOOL),
  );

  server.registerPrompt(
    'rispondi_domande',
    {
      title: 'Rispondi alle mie domande di EpicFeed',
      description: "Risponde alle domande messe in coda dall'app.",
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Rispondi alle mie domande di EpicFeed: chiama domande_in_attesa e rispondi a ciascuna con ${ANSWER_TOOL}.`,
          },
        },
      ],
    }),
  );
}

type Bilingual = { readonly it: string; readonly en: string };

/**
 * Domanda in testo per Claude, con la scheda come la vedeva lo studente.
 *
 * @param question - Domanda in coda.
 * @param feed - Materia, se si è potuta leggere.
 * @returns Il testo.
 */
export function formatQuestion(question: StoredQuestion, feed: SubjectFeed | null): string {
  const lesson = feed?.chapters
    .flatMap((chapter) => chapter.lessons)
    .find((item) => item.lessonId === question.lessonId);
  const lang = question.language;
  const lines = [
    `Domanda ${question.id} (${lang === 'it' ? 'studia in italiano' : 'studia in inglese'}):`,
    `«${question.question}»`,
    `Materia: ${feed?.title ?? question.subjectId} · Lezione: ${lesson?.title ?? question.lessonId}`,
  ];
  const pick = (value: Bilingual) => value[lang];
  if (question.itemType === 'card') {
    const card = lesson?.feed?.cards.find((item) => item.id === question.itemId);
    if (card) {
      lines.push(`Scheda «${pick(card.title)}»: ${pick(card.keyPoint)}`, pick(card.body));
      if (card.video)
        lines.push(
          `Video dal minuto ${String(Math.floor(card.video.startMs / 60000))}:${String(Math.floor((card.video.startMs % 60000) / 1000)).padStart(2, '0')}.`,
        );
    } else {
      lines.push(`Scheda ${question.itemId} (non più nel feed: la lezione è stata rigenerata).`);
    }
  } else {
    const quiz = lesson?.feed?.quiz.find((item) => item.id === question.itemId);
    if (quiz) {
      lines.push(`Domanda del feed: ${pick(quiz.question)}`);
      if (quiz.kind === 'multiple_choice') {
        lines.push(
          ...quiz.options[lang].map((option, i) => `${String.fromCharCode(65 + i)}) ${option}`),
          `Giusta: ${String.fromCharCode(65 + quiz.correctIndex)}`,
        );
      } else {
        lines.push(`Vero o falso; giusta: ${quiz.answer ? 'vero' : 'falso'}`);
      }
      lines.push(`Spiegazione: ${pick(quiz.explanation)}`);
    } else {
      lines.push(`Domanda del feed ${question.itemId} (non più nel feed).`);
    }
  }
  return lines.join('\n');
}
