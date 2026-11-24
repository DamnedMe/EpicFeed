import type { LessonId, UserId } from '@epicfeed/shared';
import { DomainError, parseId } from '@epicfeed/shared';
import { FeedValidationError } from '@epicfeed/feed';
import * as z from 'zod';
import { apiError, bearerToken, readLimited } from './http';

/**
 * Parti comuni dell'API della generazione (M2, ADR 0013), chiamata dal server
 * MCP di Claude Desktop con un token "genera": token, limite di frequenza,
 * lettura del corpo e traduzione degli errori. Gli handler stanno nelle
 * funzioni che li usano (`features/feed/api`, `features/exam/api`).
 */

/** Dipendenze comuni a tutti gli handler della generazione. */
export interface GenerationAccessDeps {
  /** Verifica il token di generazione e restituisce l'utente, o `null`. */
  verifyToken(token: string): Promise<string | null>;
  /** Dice se l'utente è sotto il limite di frequenza. */
  isAllowed(userId: string): Promise<boolean>;
  /** Registra una chiamata per il limite di frequenza. */
  record(
    userId: string,
    action: 'read' | 'save' | 'slides',
    lessonId: string | null,
  ): Promise<void>;
  /** Registra un errore inatteso (senza contenuti). */
  logError(error: unknown): void;
}

/** Utente autorizzato, oppure la risposta di errore da restituire. */
export type Authorized = { readonly userId: UserId } | { readonly response: Response };

/** Token valido e limite di frequenza rispettato, oppure la risposta di errore. */
export async function authorize(request: Request, deps: GenerationAccessDeps): Promise<Authorized> {
  const token = bearerToken(request);
  const userId = token ? await deps.verifyToken(token) : null;
  if (!userId) {
    return {
      response: apiError(
        'UNAUTHORIZED',
        'Token di Claude Desktop mancante, scaduto o revocato: creane uno nuovo nella pagina Claude Desktop di EpicFeed.',
      ),
    };
  }
  if (!(await deps.isAllowed(userId))) {
    return {
      response: apiError(
        'RATE_LIMITED',
        'Troppe richieste in poco tempo: riprova tra qualche minuto.',
        { 'Retry-After': '600' },
      ),
    };
  }
  return { userId: parseId(userId, 'UserId') };
}

/**
 * Traduce gli errori del dominio nelle risposte HTTP della generazione.
 *
 * @param subject - Cosa si stava salvando, per il messaggio dei problemi.
 * @param notFound - Messaggio per una lezione non trovata.
 */
export function domainErrorResponse(
  error: unknown,
  deps: GenerationAccessDeps,
  subject = 'Il feed',
  notFound = 'Lezione non trovata tra quelle che hai importato.',
): Response {
  if (error instanceof FeedValidationError) {
    return apiError(
      'INVALID_FEED',
      `${subject} non rispetta le regole: correggi i problemi elencati e salva di nuovo.`,
      {},
      error.issues,
    );
  }
  if (error instanceof DomainError) {
    if (error.code === 'NOT_FOUND') return apiError('NOT_FOUND', notFound);
    if (error.code === 'SOURCES_CHANGED' || error.code === 'ALREADY_DONE') {
      return apiError('CONFLICT', error.message);
    }
    return apiError('INVALID_CONTENT', error.message);
  }
  deps.logError(error);
  return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
}

/** Legge un corpo JSON entro il limite di dimensione, o restituisce l'errore. */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
  tooLarge: string,
): Promise<{ readonly json: unknown } | Response> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  const raw = declared > maxBytes ? null : await readLimited(request, maxBytes);
  if (raw === null) return apiError('PAYLOAD_TOO_LARGE', tooLarge);
  try {
    return { json: JSON.parse(raw) as unknown };
  } catch {
    return apiError('INVALID_REQUEST', 'Il corpo della richiesta non è JSON valido.');
  }
}

/** Tutti i problemi di forma, come per le regole: Claude li corregge in una volta. */
export function zodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 200).map((issue) => ({
    path: issue.path.join('.').slice(0, 200),
    message: issue.message.slice(0, 500),
  }));
}

/** Numero di elementi per pagina (`?limit=`), da 1 a 100, 20 se manca o non è valido. */
export const limitSchema = z.coerce.number().int().min(1).max(100).catch(20);

/** Valida l'id della lezione nel percorso. */
export function lessonIdFrom(raw: string): LessonId | null {
  const parsed = z.uuid().safeParse(raw);
  return parsed.success ? parseId(parsed.data, 'LessonId') : null;
}
