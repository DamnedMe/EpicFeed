import type { ReportErrorInput, StoredCorrection } from '@epicfeed/feed';
import type { UserId } from '@epicfeed/shared';
import { DomainError, parseId } from '@epicfeed/shared';
import {
  FeedValidationError,
  MAX_CORRECTION_REQUEST_BYTES,
  reportErrorRequestSchema,
} from '@epicfeed/feed';
import * as z from 'zod';
import { apiError, apiOk, isSameOrigin, readLimited } from '@/server/http';

/**
 * Handler di Segnala errore (M5, ADR 0020), usati dalla web app con la
 * sessione dello studente: elenco, nuova correzione, annullamento. Funzioni
 * pure rispetto alle dipendenze, provate senza database né Next.js.
 */
export interface CorrectionsHandlerDeps {
  /** Utente della sessione, oppure `null` se non autenticato. */
  readonly currentUserId: () => Promise<string | null>;
  readonly listCorrections: (userId: UserId) => Promise<StoredCorrection[]>;
  readonly reportError: (
    userId: UserId,
    input: ReportErrorInput,
  ) => Promise<{ correction: StoredCorrection; created: boolean }>;
  readonly withdrawCorrection: (userId: UserId, id: string) => Promise<void>;
  readonly logError: (error: unknown) => void;
}

async function authenticate(deps: CorrectionsHandlerDeps): Promise<UserId | Response> {
  const rawUser = await deps.currentUserId();
  if (!rawUser) return apiError('UNAUTHORIZED', 'Accedi a EpicFeed per segnalare un errore.');
  return parseId(rawUser, 'UserId');
}

/** Errori inattesi: registrati, senza dettagli nella risposta. */
function internal(error: unknown, deps: CorrectionsHandlerDeps): Response {
  deps.logError(error);
  return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
}

/**
 * `GET /api/corrections`: tutte le correzioni dello studente, da applicare
 * al feed sul dispositivo. Dati personali, mai in cache condivise.
 *
 * @param deps - Servizi.
 * @returns La risposta HTTP (forma di `correctionsResponseSchema`).
 */
export async function handleListCorrections(deps: CorrectionsHandlerDeps): Promise<Response> {
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  try {
    return apiOk({ corrections: await deps.listCorrections(userId) });
  } catch (error) {
    return internal(error, deps);
  }
}

/**
 * `POST /api/corrections`: salva una correzione (*Segnala errore*). Solo dalla
 * web app stessa. Reinviare lo stesso id restituisce la correzione già salvata.
 *
 * @param request - Richiesta HTTP (corpo: `reportErrorRequestSchema`).
 * @param deps - Servizi.
 * @returns `201` se nuova, `200` se c'era già, con la correzione salvata.
 */
export async function handleReportError(
  request: Request,
  deps: CorrectionsHandlerDeps,
): Promise<Response> {
  // Cookie di sessione: solo dalla web app stessa (difesa da CSRF).
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;

  const declared = Number(request.headers.get('content-length') ?? 0);
  const raw =
    declared > MAX_CORRECTION_REQUEST_BYTES
      ? null
      : await readLimited(request, MAX_CORRECTION_REQUEST_BYTES);
  if (raw === null) return apiError('PAYLOAD_TOO_LARGE', 'La correzione è troppo lunga.');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError('INVALID_REQUEST', 'Il corpo della richiesta non è JSON valido.');
  }
  const parsed = reportErrorRequestSchema.safeParse(json);
  if (!parsed.success) {
    return apiError('INVALID_REQUEST', 'La correzione non ha la forma attesa.');
  }
  const { id, subjectId, correction } = parsed.data;
  try {
    const result = await deps.reportError(userId, {
      id: id.toLowerCase(),
      subjectId: subjectId.toLowerCase(),
      correction:
        correction.kind === 'term'
          ? correction
          : { ...correction, lessonId: correction.lessonId.toLowerCase() },
    });
    return apiOk({ correction: result.correction }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof FeedValidationError) {
      return apiError('INVALID_REQUEST', 'La correzione non è valida.', {}, error.issues);
    }
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Lezione non trovata tra quelle che hai importato.');
    }
    if (error instanceof DomainError && error.code === 'LIMIT_REACHED') {
      return apiError('CONFLICT', error.message);
    }
    if (error instanceof DomainError && error.code === 'ALREADY_DONE') {
      return apiError('CONFLICT', 'Riprova: la correzione riceverà un nuovo identificativo.');
    }
    return internal(error, deps);
  }
}

/**
 * `DELETE /api/corrections/:id`: annulla una correzione (*Le mie segnalazioni*).
 *
 * @param request - Richiesta HTTP.
 * @param rawId - Id della correzione dal percorso.
 * @param deps - Servizi.
 * @returns `204`, oppure `404`.
 */
export async function handleWithdrawCorrection(
  request: Request,
  rawId: string,
  deps: CorrectionsHandlerDeps,
): Promise<Response> {
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError('NOT_FOUND', 'Correzione non trovata.');
  try {
    await deps.withdrawCorrection(userId, id.data.toLowerCase());
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Correzione non trovata.');
    }
    return internal(error, deps);
  }
}
