import type { EncryptedProgressRepository, UserId } from '@study-feed/core';
import { parseId } from '@study-feed/core';
import type { ProgressPutResponse, ProgressResponse } from '@study-feed/contracts';
import { progressPutSchema } from '@study-feed/contracts';
import { apiError, apiOk, isSameOrigin, readLimited } from './http';

/**
 * API dei progressi sincronizzati (M4, ADR 0018), usata dalla web app con la
 * sessione dello studente. Il server conserva e restituisce una copia cifrata
 * nel browser: ne controlla solo forma, dimensioni e versione.
 */
export interface ProgressHandlerDeps {
  /** Utente della sessione, oppure `null` se non autenticato. */
  readonly currentUserId: () => Promise<string | null>;
  readonly repository: EncryptedProgressRepository;
  readonly logError: (error: unknown) => void;
}

/** Corpo massimo di `PUT`: testo cifrato più il resto del JSON (sotto i 4,5 MB di Vercel). */
export const MAX_PROGRESS_BODY = 4_100_000;

async function authenticate(deps: ProgressHandlerDeps): Promise<UserId | Response> {
  const userId = await deps.currentUserId();
  if (!userId) return apiError('UNAUTHORIZED', 'Accedi a EpicFeed per sincronizzare i progressi.');
  return parseId(userId, 'UserId');
}

/**
 * `GET /api/progress`: la copia cifrata dello studente, `404` se non c'è.
 *
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleReadProgress(deps: ProgressHandlerDeps): Promise<Response> {
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  try {
    const stored = await deps.repository.get(userId);
    if (!stored) return apiError('NOT_FOUND', 'Nessuna copia dei progressi sul server.');
    const body: ProgressResponse = { ...stored };
    return apiOk(body);
  } catch (error) {
    deps.logError(error);
    return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
  }
}

/**
 * `PUT /api/progress`: scrive la copia cifrata se sul server c'è ancora la
 * versione da cui è partito il dispositivo, altrimenti `409` e il dispositivo
 * rilegge, unisce e riprova.
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleWriteProgress(
  request: Request,
  deps: ProgressHandlerDeps,
): Promise<Response> {
  // Cookie di sessione: solo dalla web app stessa (difesa da CSRF).
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;

  const declared = Number(request.headers.get('content-length') ?? 0);
  const raw = declared > MAX_PROGRESS_BODY ? null : await readLimited(request, MAX_PROGRESS_BODY);
  if (raw === null)
    return apiError('PAYLOAD_TOO_LARGE', 'I progressi superano lo spazio previsto.');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError('INVALID_REQUEST', 'Il corpo della richiesta non è JSON valido.');
  }
  const parsed = progressPutSchema.safeParse(json);
  if (!parsed.success) return apiError('INVALID_REQUEST', 'La copia non ha la forma attesa.');

  const { baseRevision, ...data } = parsed.data;
  try {
    const revision = await deps.repository.put(userId, data, baseRevision);
    if (revision === null) {
      return apiError('CONFLICT', 'I progressi sono cambiati su un altro dispositivo.');
    }
    const body: ProgressPutResponse = { revision };
    return apiOk(body);
  } catch (error) {
    deps.logError(error);
    return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
  }
}
