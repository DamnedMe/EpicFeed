import type {
  LessonForGeneration,
  LessonId,
  LessonsToGenerateResult,
  SaveLessonFeedInput,
  SaveLessonFeedResult,
  UserId,
} from '@study-feed/core';
import { DomainError, FeedValidationError, parseId } from '@study-feed/core';
import type {
  LessonSourcesResponse,
  LessonsToGenerateResponse,
  SaveLessonFeedResponse,
} from '@study-feed/contracts';
import { MAX_FEED_BODY_BYTES, saveLessonFeedRequestSchema } from '@study-feed/contracts';
import { z } from 'zod';
import { apiError, apiOk, bearerToken, readLimited } from './http';

/**
 * API della generazione (M2, ADR 0013), chiamata dal server MCP di Claude
 * Desktop con un token "genera". Ogni handler è una funzione pura rispetto a
 * Next.js (riceve una `Request` standard e le dipendenze), così si testa
 * senza avviare il server.
 */

/** Dipendenze degli handler della generazione: tutte sostituibili nei test. */
export interface GenerationHandlerDeps {
  /** Verifica il token di generazione e restituisce l'utente, o `null`. */
  verifyToken(token: string): Promise<string | null>;
  /** Dice se l'utente è sotto il limite di frequenza. */
  isAllowed(userId: string): Promise<boolean>;
  /** Registra una chiamata per il limite di frequenza. */
  record(userId: string, action: 'read' | 'save', lessonId: string | null): Promise<void>;
  listLessons(userId: UserId, limit: number): Promise<LessonsToGenerateResult>;
  readLesson(userId: UserId, lessonId: LessonId): Promise<LessonForGeneration>;
  saveFeed(userId: UserId, input: SaveLessonFeedInput): Promise<SaveLessonFeedResult>;
  /** Registra un errore inatteso (senza contenuti). */
  logError(error: unknown): void;
}

type Authorized = { readonly userId: UserId } | { readonly response: Response };

/** Token valido e limite di frequenza rispettato, oppure la risposta di errore. */
async function authorize(request: Request, deps: GenerationHandlerDeps): Promise<Authorized> {
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

/** Traduce gli errori del dominio nelle risposte HTTP della generazione. */
function domainErrorResponse(error: unknown, deps: GenerationHandlerDeps): Response {
  if (error instanceof FeedValidationError) {
    return apiError(
      'INVALID_FEED',
      'Il feed non rispetta le regole: correggi i problemi elencati e salva di nuovo.',
      {},
      error.issues,
    );
  }
  if (error instanceof DomainError) {
    if (error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Lezione non trovata tra quelle che hai importato.');
    }
    if (error.code === 'SOURCES_CHANGED') return apiError('CONFLICT', error.message);
    return apiError('INVALID_CONTENT', error.message);
  }
  deps.logError(error);
  return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
}

const limitSchema = z.coerce.number().int().min(1).max(100).catch(20);

/**
 * `GET /api/generation/lessons?limit=20`: lezioni da generare e totali.
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListLessons(
  request: Request,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const limit = limitSchema.parse(new URL(request.url).searchParams.get('limit') ?? undefined);
  try {
    const result = await deps.listLessons(auth.userId, limit);
    const body: LessonsToGenerateResponse = {
      lessons: result.lessons.map((lesson) => ({ ...lesson })),
      totals: { ...result.totals },
    };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}

/** Valida l'id della lezione nel percorso. */
function lessonIdFrom(raw: string): LessonId | null {
  const parsed = z.uuid().safeParse(raw);
  return parsed.success ? parseId(parsed.data, 'LessonId') : null;
}

/**
 * `GET /api/generation/lessons/:id`: fonti della lezione per Claude.
 *
 * @param request - Richiesta HTTP.
 * @param rawLessonId - Id della lezione dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleReadLesson(
  request: Request,
  rawLessonId: string,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const lessonId = lessonIdFrom(rawLessonId);
  if (!lessonId) return apiError('INVALID_REQUEST', 'Id della lezione non valido.');
  // Si registra ogni tentativo, anche quelli che falliscono: il limite deve
  // fermare anche un client che riprova all'infinito.
  await deps.record(auth.userId, 'read', lessonId);
  try {
    const lesson = await deps.readLesson(auth.userId, lessonId);
    const body: LessonSourcesResponse = {
      lessonId: lesson.lessonId,
      sourcesHash: lesson.sourcesHash,
      lessonTitle: lesson.lessonTitle,
      chapterTitle: lesson.chapterTitle,
      subjectTitle: lesson.subjectTitle,
      parts: lesson.parts.map((part) => ({
        lessonPartId: part.lessonPartId,
        title: part.title,
        kind: part.kind,
        position: part.position,
        hasSubtitles: part.subtitles.length > 0,
        content: part.content,
      })),
      glossary: lesson.glossary.map((entry) => ({ ...entry })),
    };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}

/**
 * `POST /api/generation/lessons/:id/feed`: salva il feed generato.
 *
 * @param request - Richiesta HTTP (corpo: `saveLessonFeedRequestSchema`).
 * @param rawLessonId - Id della lezione dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleSaveFeed(
  request: Request,
  rawLessonId: string,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const lessonId = lessonIdFrom(rawLessonId);
  if (!lessonId) return apiError('INVALID_REQUEST', 'Id della lezione non valido.');

  await deps.record(auth.userId, 'save', lessonId);
  const declared = Number(request.headers.get('content-length') ?? '0');
  const raw =
    declared > MAX_FEED_BODY_BYTES ? null : await readLimited(request, MAX_FEED_BODY_BYTES);
  if (raw === null) return apiError('PAYLOAD_TOO_LARGE', 'Il feed è troppo grande.');

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError('INVALID_REQUEST', 'Il corpo della richiesta non è JSON valido.');
  }
  const parsed = saveLessonFeedRequestSchema.safeParse(json);
  if (!parsed.success) {
    // Tutti i problemi di forma, come per le regole: Claude li corregge in una volta.
    const issues = parsed.error.issues.slice(0, 200).map((issue) => ({
      path: issue.path.join('.').slice(0, 200),
      message: issue.message.slice(0, 500),
    }));
    return apiError('INVALID_FEED', 'Il feed non ha la forma attesa.', {}, issues);
  }
  if (parsed.data.lessonId.toLowerCase() !== lessonId) {
    return apiError('INVALID_REQUEST', 'La lezione del feed non corrisponde al percorso.');
  }

  try {
    const result = await deps.saveFeed(auth.userId, { ...parsed.data, lessonId });
    const body: SaveLessonFeedResponse = { ...result };
    return apiOk(body, result.created ? 201 : 200);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}
