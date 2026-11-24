import type { ImportLessonResult, LessonImport, UserId } from '@epicfeed/core';
import { DomainError, parseId } from '@epicfeed/core';
import type { ImportLessonResponse } from '@epicfeed/contracts';
import { MAX_IMPORT_BODY_BYTES, importLessonRequestSchema } from '@epicfeed/contracts';
import { apiError, apiOk, bearerToken, readLimited } from './http';

/** Dipendenze di {@link handleImport}: tutte sostituibili nei test. */
export interface ImportHandlerDeps {
  /** Verifica il token di import e restituisce l'utente, o `null`. */
  verifyToken(token: string): Promise<string | null>;
  /** Dice se l'utente è sotto il limite di frequenza. */
  isAllowed(userId: string): Promise<boolean>;
  /** Esegue il caso d'uso `ImportLesson`. */
  importLesson(userId: UserId, input: LessonImport): Promise<ImportLessonResult>;
  /** Registra l'import riuscito (limite di frequenza e cronologia). */
  record(userId: string, lessonId: string, partCount: number): Promise<void>;
  /** Registra un errore inatteso (senza dati personali). */
  logError(error: unknown): void;
}

/**
 * Gestisce `POST /api/import`: autenticazione con token di import, limite di
 * frequenza, limite di dimensione, validazione zod, caso d'uso del core.
 *
 * È una funzione pura rispetto a Next.js (riceve una `Request` standard),
 * così si testa senza avviare il server.
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleImport(request: Request, deps: ImportHandlerDeps): Promise<Response> {
  const token = bearerToken(request);
  const userId = token ? await deps.verifyToken(token) : null;
  if (!userId) {
    return apiError(
      'UNAUTHORIZED',
      "Estensione non collegata o token scaduto: ricollegala dall'app.",
    );
  }

  if (!(await deps.isAllowed(userId))) {
    return apiError('RATE_LIMITED', 'Troppi import in poco tempo: riprova tra qualche minuto.', {
      'Retry-After': '600',
    });
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_IMPORT_BODY_BYTES) {
    return apiError('PAYLOAD_TOO_LARGE', 'La lezione è troppo grande per essere importata.');
  }
  const raw = await readLimited(request, MAX_IMPORT_BODY_BYTES);
  if (raw === null) {
    return apiError('PAYLOAD_TOO_LARGE', 'La lezione è troppo grande per essere importata.');
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError('INVALID_REQUEST', 'Il corpo della richiesta non è JSON valido.');
  }
  const parsed = importLessonRequestSchema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join('.') ?? '';
    return apiError(
      'INVALID_REQUEST',
      `Dati della lezione non validi${where ? ` (${where})` : ''}.`,
    );
  }

  try {
    const result = await deps.importLesson(parseId(userId, 'UserId'), parsed.data);
    await deps.record(userId, result.lessonId, result.parts.length);
    const body: ImportLessonResponse = {
      lessonId: result.lessonId,
      parts: result.parts.map((part) => ({
        epicodeId: part.epicodeId,
        lessonPartId: part.lessonPartId,
        contentVersionId: part.contentVersionId,
        newVersion: part.newVersion,
        newEntitlement: part.newEntitlement,
        generationStatus: part.generationStatus,
        subtitles: part.subtitles.map((track) => ({ ...track })),
      })),
    };
    return apiOk(body);
  } catch (error) {
    if (error instanceof DomainError) {
      return error.code === 'ENTITLEMENT_MISMATCH'
        ? apiError('ENTITLEMENT_MISMATCH', 'Il contenuto non corrisponde alla lezione.')
        : apiError('INVALID_CONTENT', error.message);
    }
    deps.logError(error);
    return apiError('INTERNAL', 'Import non riuscito per un errore del server. Riprova più tardi.');
  }
}
