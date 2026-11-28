import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import * as z from 'zod';
import { text, withErrors } from '../tool-results.js';
import type { StudyLibrary } from './library.js';
import type { StudentProgress } from './progress.js';
import { progressProblem } from './progress.js';
import type { ChatQuiz, ChatQuizQuestion } from './quiz.js';
import type { QuizViewData } from './quiz-session.js';
import { MAX_QUIZ_QUESTIONS, pickQuiz, quizAnswerRecords } from './quiz.js';
import type { QuizViewSource } from './quiz-view.js';
import { QUIZ_VIEW_URI } from './quiz-view.js';

/** Servizi del quiz al volo. */
export interface QuizServices {
  readonly library: StudyLibrary;
  readonly progress: StudentProgress;
  readonly view: QuizViewSource;
  readonly now?: () => Date;
}

/** Strumento che la scheda chiama alla fine del quiz. */
export const RECORD_TOOL = 'registra_risposte';

/**
 * Registra il quiz al volo (M6, ADR 0021, scelta 3): lo strumento
 * `quiz_al_volo`, che Claude Desktop mostra come una scheda interattiva
 * nella chat (app MCP), lo strumento `registra_risposte`, che la scheda (o
 * Claude, se il quiz si fa a testo) chiama alla fine, e la risorsa della
 * scheda.
 *
 * @param server - Server MCP di EpicFeed.
 * @param services - Servizi.
 */
export function registerQuizTools(server: McpServer, services: QuizServices): void {
  const now = services.now ?? (() => new Date());

  registerAppTool(
    server,
    'quiz_al_volo',
    {
      title: 'Quiz al volo',
      description:
        'Prepara un quiz sulle lezioni dello studente e lo mostra come una scheda interattiva nella chat: senza argomento parte dai concetti deboli. Le risposte tornano nel ripasso dell’app. Se la scheda non compare, fai le domande una alla volta in chat e alla fine chiama registra_risposte.',
      inputSchema: {
        materia: z
          .string()
          .trim()
          .max(120)
          .optional()
          .describe('Materia: id o parte del titolo (es. "DSA"). Vuoto: la prima con lezioni.'),
        argomento: z
          .string()
          .trim()
          .max(120)
          .optional()
          .describe('Concetto o lezione (es. "AVL"). Vuoto: i concetti deboli.'),
        domande: z
          .number()
          .int()
          .min(1)
          .max(MAX_QUIZ_QUESTIONS)
          .optional()
          .describe('Quante domande (5).'),
        lingua: z
          .enum(['it', 'en'])
          .optional()
          .describe('Lingua del quiz (quella dello studente).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: QUIZ_VIEW_URI } },
    },
    async ({ materia, argomento, domande, lingua }) =>
      withErrors(async () => {
        const [feed] = await services.library.feedsFor(materia);
        if (!feed) {
          return text(
            materia
              ? `Nessuna materia con lezioni generate corrisponde a «${materia}».`
              : 'Lo studente non ha ancora lezioni con il feed.',
          );
        }
        const reading = await services.progress.read();
        const answers = reading.status === 'ok' ? reading.snapshot.answers : [];
        const quiz = pickQuiz(feed, answers, { topic: argomento, count: domande ?? 5 }, now());
        if (quiz.questions.length === 0) {
          return text(
            `Nessuna domanda su «${argomento ?? ''}» in ${feed.title}: prova con un altro argomento o con cerca_lezione.`,
          );
        }
        const language = lingua ?? 'it';
        const data: QuizViewData = {
          quiz,
          language,
          canRecord: reading.status === 'ok',
          recordTool: RECORD_TOOL,
        };
        const notes = [
          `Quiz di ${String(quiz.questions.length)} domande su ${quiz.subjectTitle} (${FOCUS[quiz.focus]}), mostrato nella scheda interattiva: lo studente risponde lì e la scheda registra le risposte. Non ripetere le domande in chat; quando lo studente ha finito, commenta gli errori.`,
          'Se la scheda non compare, fai le domande una alla volta in chat senza rivelare la soluzione, poi chiama registra_risposte con tutte le risposte.',
        ];
        if (reading.status !== 'ok') {
          notes.push(`Le risposte non torneranno nel ripasso: ${progressProblem(reading.status)}`);
        }
        notes.push('', ...quiz.questions.map((q, i) => formatQuestion(q, i, language)));
        return {
          content: [{ type: 'text', text: notes.join('\n') }],
          structuredContent: data as unknown as Record<string, unknown>,
        };
      }),
  );

  server.registerTool(
    RECORD_TOOL,
    {
      title: 'Registra risposte',
      description:
        'Aggiunge al ripasso dello studente le risposte di un quiz al volo, cifrate sul PC: giusta vale «bene», sbagliata «di nuovo», come nel feed. La scheda del quiz la chiama da sola; chiamala tu solo se il quiz si è fatto a testo.',
      inputSchema: {
        risposte: z
          .array(
            z.strictObject({
              conceptId: z
                .string()
                .regex(/^[0-9a-f-]{36}:[a-z0-9-]{1,80}$/, 'conceptId del quiz')
                .describe('Dal quiz.'),
              questionId: z.string().min(1).max(300).nullable().describe('Dal quiz.'),
              correct: z.boolean(),
              language: z.enum(['it', 'en']),
            }),
          )
          .min(1)
          .max(MAX_QUIZ_QUESTIONS * 2),
      },
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ risposte }) =>
      withErrors(async () => {
        const result = await services.progress.append(quizAnswerRecords(risposte, now()));
        if (result.status !== 'ok') return text(progressProblem(result.status));
        const right = risposte.filter((answer) => answer.correct).length;
        return text(
          `Risposte registrate nel ripasso: ${String(right)} giuste su ${String(risposte.length)}. Lo studente le ritrova nell'app alla prossima sincronizzazione.`,
        );
      }, RECORD_TOOL),
  );

  registerAppResource(
    server,
    'Quiz EpicFeed',
    QUIZ_VIEW_URI,
    { description: 'Scheda interattiva del quiz al volo.' },
    async () => ({
      contents: [{ uri: QUIZ_VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: await services.view() }],
    }),
  );
}

const FOCUS: Record<ChatQuiz['focus'], string> = {
  weak: 'concetti deboli',
  requested: 'argomento richiesto',
  mixed: 'concetti da ripassare',
};

/**
 * Domanda in testo per Claude, con la soluzione (per il quiz a testo).
 *
 * @param question - Domanda.
 * @param index - Posizione (da 0).
 * @param language - Lingua del quiz.
 * @returns Il testo.
 */
export function formatQuestion(
  question: ChatQuizQuestion,
  index: number,
  language: 'it' | 'en',
): string {
  const out = [
    `${String(index + 1)}. ${question.question[language]} (concetto «${question.conceptName[language]}», lezione «${question.lessonTitle}»)`,
  ];
  if (question.kind === 'multiple_choice') {
    question.options[language].forEach((option, i) => {
      out.push(`   ${String.fromCharCode(65 + i)}) ${option}`);
    });
    out.push(
      `   Soluzione (non rivelarla prima): ${String.fromCharCode(65 + question.correctIndex)}`,
    );
  } else {
    out.push(
      `   Vero o falso. Soluzione (non rivelarla prima): ${question.answer ? 'vero' : 'falso'}`,
    );
  }
  out.push(`   Spiegazione: ${question.explanation[language]}`);
  out.push(`   conceptId ${question.conceptId} · questionId ${question.questionId}`);
  return out.join('\n');
}
