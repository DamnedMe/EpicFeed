import type {
  ImportedSlidesResult,
  LessonForGeneration,
  LessonsToGenerateResult,
  OwnedLessonSummary,
  SlidesPresentationInput,
  SaveLessonFeedInput,
  SaveLessonFeedResult,
  ImportSlidesResponse,
  LessonSourcesResponse,
  LessonsToGenerateResponse,
  OwnedLessonsResponse,
  SaveLessonFeedResponse,
} from '@epicfeed/feed';
import type { LessonId, UserId } from '@epicfeed/shared';
import {
  MAX_FEED_BODY_BYTES,
  MAX_SLIDES_BODY_BYTES,
  importSlidesRequestSchema,
  saveLessonFeedRequestSchema,
} from '@epicfeed/feed';
import { apiError, apiOk } from '@/server/http';
import type { GenerationAccessDeps } from '@/server/generation-api';
import {
  authorize,
  domainErrorResponse,
  lessonIdFrom,
  limitSchema,
  readJsonBody,
  zodIssues,
} from '@/server/generation-api';

/**
 * API della generazione del feed (M2, ADR 0013), chiamata dal server MCP di
 * Claude Desktop con un token "genera". Ogni handler è una funzione pura
 * rispetto a Next.js (riceve una `Request` standard e le dipendenze), così si
 * testa senza server.
 */

/** Dipendenze degli handler della generazione del feed: tutte sostituibili nei test. */
export interface FeedGenerationDeps extends GenerationAccessDeps {
  listLessons(userId: UserId, limit: number): Promise<LessonsToGenerateResult>;
  readLesson(userId: UserId, lessonId: LessonId): Promise<LessonForGeneration>;
  saveFeed(userId: UserId, input: SaveLessonFeedInput): Promise<SaveLessonFeedResult>;
  listOwnedLessons(userId: UserId): Promise<OwnedLessonSummary[]>;
  importSlides(
    userId: UserId,
    lessonId: LessonId,
    presentations: readonly SlidesPresentationInput[],
  ): Promise<ImportedSlidesResult[]>;
}

/**
 * `GET /api/generation/lessons?limit=20`: lezioni da generare e totali.
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListLessons(
  request: Request,
  deps: FeedGenerationDeps,
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
  deps: FeedGenerationDeps,
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
        // Copia mutabile per il tipo della risposta (le pagine del dominio sono readonly).
        content:
          part.content.kind === 'slides'
            ? { ...part.content, pages: part.content.pages.map((page) => ({ ...page })) }
            : part.content,
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
  deps: FeedGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const lessonId = lessonIdFrom(rawLessonId);
  if (!lessonId) return apiError('INVALID_REQUEST', 'Id della lezione non valido.');

  await deps.record(auth.userId, 'save', lessonId);
  const body = await readJsonBody(request, MAX_FEED_BODY_BYTES, 'Il feed è troppo grande.');
  if (body instanceof Response) return body;
  const parsed = saveLessonFeedRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError('INVALID_FEED', 'Il feed non ha la forma attesa.', {}, zodIssues(parsed.error));
  }
  if (parsed.data.lessonId.toLowerCase() !== lessonId) {
    return apiError('INVALID_REQUEST', 'La lezione del feed non corrisponde al percorso.');
  }

  try {
    const result = await deps.saveFeed(auth.userId, { ...parsed.data, lessonId });
    const response: SaveLessonFeedResponse = { ...result };
    return apiOk(response, result.created ? 201 : 200);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}

/**
 * `GET /api/generation/catalog`: tutte le lezioni importate, con il numero di
 * presentazioni di slide (per abbinare lo zip alle lezioni).
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListCatalog(
  request: Request,
  deps: FeedGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  try {
    const lessons = await deps.listOwnedLessons(auth.userId);
    const body: OwnedLessonsResponse = { lessons: lessons.map((lesson) => ({ ...lesson })) };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}

/**
 * `POST /api/generation/lessons/:id/slides`: aggiunge alla lezione le sue
 * presentazioni di slide, lette sul PC dallo zip ufficiale (ADR 0012).
 *
 * @param request - Richiesta HTTP (corpo: `importSlidesRequestSchema`).
 * @param rawLessonId - Id della lezione dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleImportSlides(
  request: Request,
  rawLessonId: string,
  deps: FeedGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const lessonId = lessonIdFrom(rawLessonId);
  if (!lessonId) return apiError('INVALID_REQUEST', 'Id della lezione non valido.');

  await deps.record(auth.userId, 'slides', lessonId);
  const body = await readJsonBody(request, MAX_SLIDES_BODY_BYTES, 'Le slide sono troppo grandi.');
  if (body instanceof Response) return body;
  const parsed = importSlidesRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError(
      'INVALID_REQUEST',
      'Le slide non hanno la forma attesa.',
      {},
      zodIssues(parsed.error),
    );
  }

  try {
    const results = await deps.importSlides(
      auth.userId,
      lessonId,
      parsed.data.presentations.map(({ number, fileName, pages }) => ({
        number,
        content: { kind: 'slides', fileName, pages },
      })),
    );
    const response: ImportSlidesResponse = {
      lessonId,
      presentations: results.map((result) => ({
        number: result.number,
        lessonPartId: result.lessonPartId,
        newVersion: result.newVersion,
        pages: result.pages,
      })),
    };
    return apiOk(response);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}

// ---------------------------------------------------------------------------
// Pacchetti d'esame (M4)
// ---------------------------------------------------------------------------
