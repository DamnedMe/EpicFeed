import * as z from 'zod';
import type { QuestionDraft, StoredQuestion } from '../domain/questions.js';
import { QUESTION_LIMITS } from '../domain/questions.js';

/** Corpo di `POST /api/questions`: domanda con l'id scelto dall'app. */
export const askQuestionRequestSchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  lessonId: z.uuid(),
  itemType: z.enum(['card', 'quiz']),
  itemId: z.string().regex(/^[a-z0-9-]{1,80}$/, 'Id della scheda non valido'),
  question: z.string().trim().min(1).max(QUESTION_LIMITS.question),
  language: z.enum(['it', 'en']),
});

/** Domanda inviata dall'app dopo la validazione. */
export type AskQuestionRequest = z.infer<typeof askQuestionRequestSchema>;

/** Corpo di `POST /api/generation/questions/:id/answer` (server MCP). */
export const answerQuestionRequestSchema = z.strictObject({
  answer: z.string().trim().min(1).max(QUESTION_LIMITS.answer),
});

/** Domanda salvata. */
export const storedQuestionSchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid(),
  lessonId: z.uuid(),
  itemType: z.enum(['card', 'quiz']),
  itemId: z.string(),
  question: z.string(),
  language: z.enum(['it', 'en']),
  status: z.enum(['pending', 'answered']),
  answer: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  answeredAt: z.iso.datetime({ offset: true }).nullable(),
});

/** Risposta di `GET /api/questions` e `GET /api/generation/questions`. */
export const questionsResponseSchema = z.strictObject({
  questions: z.array(storedQuestionSchema),
});

/** Risposta di `GET /api/questions`. */
export type QuestionsResponse = z.infer<typeof questionsResponseSchema>;

/** Dimensione massima del corpo di una richiesta (16 KB). */
export const MAX_QUESTION_REQUEST_BYTES = 16 * 1024;

type Assert<T extends true> = T;

/** Verifica: la domanda accettata è quella del dominio. */
export type QuestionRequestMatchesDomain = Assert<
  AskQuestionRequest extends QuestionDraft ? true : false
>;
/** Verifica: la domanda salvata inviata è quella del dominio. */
export type StoredQuestionMatchesDomain = Assert<
  z.infer<typeof storedQuestionSchema> extends StoredQuestion ? true : false
>;
