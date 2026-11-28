import type { NewQuestion, StoredQuestion } from '@epicfeed/assistant';
import {
  MAX_QUESTION_REQUEST_BYTES,
  QuestionValidationError,
  askQuestionRequestSchema,
} from '@epicfeed/assistant';
import type { UserId } from '@epicfeed/shared';
import { DomainError, parseId } from '@epicfeed/shared';
import * as z from 'zod';
import { apiError, apiOk, isSameOrigin, readLimited } from '@/server/http';

/**
 * Handler delle domande in coda (M6, ADR 0021, scelta 1), usati dalla web
 * app con la sessione dello studente: elenco (*Io › Le mie domande*), nuova
 * domanda (*Chiedi a Claude* senza chiave), cancellazione. Funzioni pure
 * rispetto alle dipendenze, provate senza database né Next.js.
 */
export interface QuestionsHandlerDeps {
  /** Utente della sessione, oppure `null` se non autenticato. */
  readonly currentUserId: () => Promise<string | null>;
  readonly listQuestions: (userId: UserId) => Promise<StoredQuestion[]>;
  readonly askQuestion: (
    userId: UserId,
    input: NewQuestion,
  ) => Promise<{ question: StoredQuestion; created: boolean }>;
  readonly deleteQuestion: (userId: UserId, id: string) => Promise<void>;
  readonly logError: (error: unknown) => void;
}

async function authenticate(deps: QuestionsHandlerDeps): Promise<UserId | Response> {
  const rawUser = await deps.currentUserId();
  if (!rawUser) return apiError('UNAUTHORIZED', 'Accedi a EpicFeed per fare una domanda.');
  return parseId(rawUser, 'UserId');
}

/** Errori inattesi: registrati, senza dettagli nella risposta. */
function internal(error: unknown, deps: QuestionsHandlerDeps): Response {
  deps.logError(error);
  return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
}

/**
 * `GET /api/questions`: le domande dello studente, dalla più recente, con le
 * risposte arrivate. Dati personali, mai in cache condivise.
 *
 * @param deps - Servizi.
 * @returns La risposta HTTP (forma di `questionsResponseSchema`).
 */
export async function handleListQuestions(deps: QuestionsHandlerDeps): Promise<Response> {
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  try {
    return apiOk({ questions: await deps.listQuestions(userId) });
  } catch (error) {
    return internal(error, deps);
  }
}

/**
 * `POST /api/questions`: mette in coda una domanda per Claude Desktop. Solo
 * dalla web app stessa; reinviare lo stesso id restituisce quella già salvata.
 *
 * @param request - Richiesta HTTP (corpo: `askQuestionRequestSchema`).
 * @param deps - Servizi.
 * @returns `201` se nuova, `200` se c'era già, con la domanda salvata.
 */
export async function handleAskQuestion(
  request: Request,
  deps: QuestionsHandlerDeps,
): Promise<Response> {
  // Cookie di sessione: solo dalla web app stessa (difesa da CSRF).
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;

  const declared = Number(request.headers.get('content-length') ?? 0);
  const raw =
    declared > MAX_QUESTION_REQUEST_BYTES
      ? null
      : await readLimited(request, MAX_QUESTION_REQUEST_BYTES);
  if (raw === null) return apiError('PAYLOAD_TOO_LARGE', 'La domanda è troppo lunga.');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError('INVALID_REQUEST', 'Il corpo della richiesta non è JSON valido.');
  }
  const parsed = askQuestionRequestSchema.safeParse(json);
  if (!parsed.success) return apiError('INVALID_REQUEST', 'La domanda non ha la forma attesa.');
  const input = parsed.data;
  try {
    const result = await deps.askQuestion(userId, {
      ...input,
      id: input.id.toLowerCase(),
      subjectId: input.subjectId.toLowerCase(),
      lessonId: input.lessonId.toLowerCase(),
    });
    return apiOk({ question: result.question }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof QuestionValidationError) {
      return apiError(
        'INVALID_REQUEST',
        'La domanda non è valida.',
        {},
        error.issues.map((message) => ({ path: 'question', message })),
      );
    }
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Lezione non trovata tra quelle che hai importato.');
    }
    if (error instanceof DomainError && error.code === 'LIMIT_REACHED') {
      return apiError('CONFLICT', error.message);
    }
    if (error instanceof DomainError && error.code === 'ALREADY_DONE') {
      return apiError('CONFLICT', 'Riprova: la domanda riceverà un nuovo identificativo.');
    }
    return internal(error, deps);
  }
}

/**
 * `DELETE /api/questions/:id`: cancella una domanda (*Le mie domande*).
 *
 * @param request - Richiesta HTTP.
 * @param rawId - Id della domanda dal percorso.
 * @param deps - Servizi.
 * @returns `204`, oppure `404`.
 */
export async function handleDeleteQuestion(
  request: Request,
  rawId: string,
  deps: QuestionsHandlerDeps,
): Promise<Response> {
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError('NOT_FOUND', 'Domanda non trovata.');
  try {
    await deps.deleteQuestion(userId, id.data.toLowerCase());
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Domanda non trovata.');
    }
    return internal(error, deps);
  }
}
