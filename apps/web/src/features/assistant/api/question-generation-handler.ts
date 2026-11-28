import type { StoredQuestion } from '@epicfeed/assistant';
import { MAX_QUESTION_REQUEST_BYTES, answerQuestionRequestSchema } from '@epicfeed/assistant';
import type { UserId } from '@epicfeed/shared';
import * as z from 'zod';
import { apiError, apiOk } from '@/server/http';
import type { GenerationAccessDeps } from '@/server/generation-api';
import { authorize, domainErrorResponse, readJsonBody, zodIssues } from '@/server/generation-api';

/**
 * API delle domande in coda per Claude Desktop (M6, ADR 0021, scelta 1), con
 * il token "genera": le domande in attesa e il salvataggio delle risposte.
 */
export interface QuestionGenerationDeps extends GenerationAccessDeps {
  /** Domande dello studente in attesa di risposta, dalla più vecchia. */
  listPendingQuestions(userId: UserId): Promise<StoredQuestion[]>;
  answerQuestion(userId: UserId, id: string, answer: string): Promise<void>;
}

const ANSWER = 'La risposta';
const NO_QUESTION = 'Domanda non trovata.';

/**
 * `GET /api/generation/questions`: domande in attesa (al massimo 5 per volta).
 *
 * @param request - Richiesta HTTP (token "genera").
 * @param deps - Servizi.
 * @returns La risposta HTTP (forma di `questionsResponseSchema`).
 */
export async function handleListPendingQuestions(
  request: Request,
  deps: QuestionGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  await deps.record(auth.userId, 'read', null);
  try {
    return apiOk({ questions: await deps.listPendingQuestions(auth.userId) });
  } catch (error) {
    return domainErrorResponse(error, deps, ANSWER, NO_QUESTION);
  }
}

/**
 * `POST /api/generation/questions/:id/answer`: salva la risposta di Claude.
 *
 * @param request - Richiesta HTTP (corpo: `answerQuestionRequestSchema`).
 * @param rawId - Id della domanda dal percorso.
 * @param deps - Servizi.
 * @returns `201`, `404` o `409` se la domanda ha già una risposta.
 */
export async function handleAnswerQuestion(
  request: Request,
  rawId: string,
  deps: QuestionGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError('NOT_FOUND', NO_QUESTION);

  await deps.record(auth.userId, 'save', null);
  const body = await readJsonBody(request, MAX_QUESTION_REQUEST_BYTES, `${ANSWER} è troppo lunga.`);
  if (body instanceof Response) return body;
  const parsed = answerQuestionRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError(
      'INVALID_FEED',
      `${ANSWER} non ha la forma attesa.`,
      {},
      zodIssues(parsed.error),
    );
  }
  try {
    await deps.answerQuestion(auth.userId, id.data.toLowerCase(), parsed.data.answer);
    return apiOk({ saved: true }, 201);
  } catch (error) {
    return domainErrorResponse(error, deps, ANSWER, NO_QUESTION);
  }
}
