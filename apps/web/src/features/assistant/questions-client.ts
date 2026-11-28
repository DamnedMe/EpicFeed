import type { AskQuestionRequest, StoredQuestion } from '@epicfeed/assistant';
import { questionsResponseSchema, storedQuestionSchema } from '@epicfeed/assistant';
import * as z from 'zod';

/**
 * Domande in coda per Claude Desktop dal browser (M6, ADR 0021, scelta 1):
 * `POST /api/questions`, `GET /api/questions`, `DELETE /api/questions/:id`.
 */

/** Fetch sostituibile nei test. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const savedSchema = z.object({ question: storedQuestionSchema });
const errorSchema = z.object({ error: z.object({ message: z.string() }) });

/** Esito della messa in coda. */
export type QueueResult =
  | { readonly status: 'ok'; readonly question: StoredQuestion }
  | { readonly status: 'failed'; readonly message: string };

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : fallback;
}

/**
 * Mette in coda una domanda.
 *
 * @param input - Domanda con id, materia, lezione e scheda.
 * @param fetchFn - Fetch del browser.
 * @returns La domanda salvata, oppure il messaggio per lo studente.
 */
export async function queueQuestion(
  input: AskQuestionRequest,
  fetchFn: FetchLike = (url, init) => fetch(url, init),
): Promise<QueueResult> {
  try {
    const response = await fetchFn('/api/questions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return {
        status: 'failed',
        message: await errorMessage(response, 'Non sono riuscito a salvare la domanda: riprova.'),
      };
    }
    const parsed = savedSchema.safeParse(await response.json());
    return parsed.success
      ? { status: 'ok', question: parsed.data.question }
      : { status: 'failed', message: 'Risposta inattesa del server: riprova.' };
  } catch {
    return { status: 'failed', message: 'Nessuna connessione: riprova quando sei online.' };
  }
}

/**
 * Le domande dello studente, dalla più recente.
 *
 * @param fetchFn - Fetch del browser.
 * @returns Le domande, oppure `null` se non si possono leggere.
 */
export async function loadQuestions(
  fetchFn: FetchLike = (url, init) => fetch(url, init),
): Promise<StoredQuestion[] | null> {
  try {
    const response = await fetchFn('/api/questions', { cache: 'no-store' });
    if (!response.ok) return null;
    const parsed = questionsResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.questions : null;
  } catch {
    return null;
  }
}

/**
 * Cancella una domanda.
 *
 * @param id - Domanda.
 * @param fetchFn - Fetch del browser.
 * @returns `true` se cancellata (o già assente).
 */
export async function deleteQuestion(
  id: string,
  fetchFn: FetchLike = (url, init) => fetch(url, init),
): Promise<boolean> {
  try {
    const response = await fetchFn(`/api/questions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
