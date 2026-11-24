import type {
  ExamCorrectionDraft,
  StoredSubmission,
  ImportedSlidesResult,
  LessonExamMaterial,
  LessonsForExamResult,
  SaveExamBankInput,
  SaveExamBankResult,
  SubjectForExam,
  SaveExamPackInput,
  SaveExamPackResult,
  LessonForGeneration,
  LessonsToGenerateResult,
  OwnedLessonSummary,
  SlidesPresentationInput,
  SaveLessonFeedInput,
  SaveLessonFeedResult,
} from '@epicfeed/core';
import type { LessonId, UserId } from '@epicfeed/shared';
import { DomainError, parseId } from '@epicfeed/shared';
import { FeedValidationError } from '@epicfeed/core';
import type {
  ImportSlidesResponse,
  LessonForExamResponse,
  LessonsForExamResponse,
  SaveExamBankResponse,
  SubjectsForExamResponse,
  SaveExamPackResponse,
  LessonSourcesResponse,
  LessonsToGenerateResponse,
  OwnedLessonsResponse,
  SaveLessonFeedResponse,
} from '@epicfeed/contracts';
import {
  MAX_CORRECTION_BODY_BYTES,
  saveCorrectionRequestSchema,
  MAX_EXAM_BANK_BODY_BYTES,
  MAX_EXAM_BODY_BYTES,
  MAX_FEED_BODY_BYTES,
  MAX_SLIDES_BODY_BYTES,
  importSlidesRequestSchema,
  saveExamBankRequestSchema,
  saveExamPackRequestSchema,
  saveLessonFeedRequestSchema,
} from '@epicfeed/contracts';
import * as z from 'zod';
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
  record(
    userId: string,
    action: 'read' | 'save' | 'slides',
    lessonId: string | null,
  ): Promise<void>;
  listLessons(userId: UserId, limit: number): Promise<LessonsToGenerateResult>;
  readLesson(userId: UserId, lessonId: LessonId): Promise<LessonForGeneration>;
  saveFeed(userId: UserId, input: SaveLessonFeedInput): Promise<SaveLessonFeedResult>;
  listOwnedLessons(userId: UserId): Promise<OwnedLessonSummary[]>;
  importSlides(
    userId: UserId,
    lessonId: LessonId,
    presentations: readonly SlidesPresentationInput[],
  ): Promise<ImportedSlidesResult[]>;
  listExamLessons(userId: UserId, limit: number): Promise<LessonsForExamResult>;
  readLessonForExam(userId: UserId, lessonId: LessonId): Promise<LessonExamMaterial>;
  saveExamPack(userId: UserId, input: SaveExamPackInput): Promise<SaveExamPackResult>;
  listExamSubjects(userId: UserId): Promise<SubjectForExam[]>;
  saveExamBank(userId: UserId, input: SaveExamBankInput): Promise<SaveExamBankResult>;
  /** Risposte dello studente ancora da correggere. */
  listSubmissionsToCorrect(userId: UserId): Promise<StoredSubmission[]>;
  saveCorrection(userId: UserId, id: string, correction: ExamCorrectionDraft): Promise<void>;
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

/**
 * Traduce gli errori del dominio nelle risposte HTTP della generazione.
 *
 * @param subject - Cosa si stava salvando, per il messaggio dei problemi.
 * @param notFound - Messaggio per una lezione non trovata.
 */
function domainErrorResponse(
  error: unknown,
  deps: GenerationHandlerDeps,
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
async function readJsonBody(
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
function zodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.slice(0, 200).map((issue) => ({
    path: issue.path.join('.').slice(0, 200),
    message: issue.message.slice(0, 500),
  }));
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
  deps: GenerationHandlerDeps,
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
  deps: GenerationHandlerDeps,
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
  deps: GenerationHandlerDeps,
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

const EXAM_PACK = "Il pacchetto d'esame";
const NO_FEED = 'Lezione senza feed tra quelle che hai importato: genera prima il feed.';

/**
 * `GET /api/generation/exam?limit=20`: lezioni con un feed ma senza pacchetto
 * d'esame, e totali.
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListExamLessons(
  request: Request,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const limit = limitSchema.parse(new URL(request.url).searchParams.get('limit') ?? undefined);
  try {
    const result = await deps.listExamLessons(auth.userId, limit);
    const body: LessonsForExamResponse = {
      lessons: result.lessons.map((lesson) => ({ ...lesson })),
      totals: { ...result.totals },
    };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps, EXAM_PACK, NO_FEED);
  }
}

/**
 * `GET /api/generation/lessons/:id/exam`: il feed della lezione in inglese,
 * per scrivere il pacchetto d'esame.
 *
 * @param request - Richiesta HTTP.
 * @param rawLessonId - Id della lezione dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleReadLessonForExam(
  request: Request,
  rawLessonId: string,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const lessonId = lessonIdFrom(rawLessonId);
  if (!lessonId) return apiError('INVALID_REQUEST', 'Id della lezione non valido.');
  await deps.record(auth.userId, 'read', lessonId);
  try {
    const material = await deps.readLessonForExam(auth.userId, lessonId);
    const body: LessonForExamResponse = {
      lessonId: material.lessonId,
      feedId: material.feedId,
      lessonTitle: material.lessonTitle,
      chapterTitle: material.chapterTitle,
      subjectTitle: material.subjectTitle,
      hasExamPack: material.hasExamPack,
      concepts: material.concepts.map((concept) => ({ ...concept })),
      cards: material.cards.map((card) => ({
        title: card.title,
        keyPoint: card.keyPoint,
        body: card.body,
        ...(card.steps ? { steps: [...card.steps] } : {}),
        ...(card.code ? { code: { ...card.code } } : {}),
        conceptKeys: [...card.conceptKeys],
      })),
      feedQuestions: [...material.feedQuestions],
    };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps, EXAM_PACK, NO_FEED);
  }
}

/**
 * `POST /api/generation/lessons/:id/exam`: salva il pacchetto d'esame.
 *
 * @param request - Richiesta HTTP (corpo: `saveExamPackRequestSchema`).
 * @param rawLessonId - Id della lezione dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleSaveExamPack(
  request: Request,
  rawLessonId: string,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const lessonId = lessonIdFrom(rawLessonId);
  if (!lessonId) return apiError('INVALID_REQUEST', 'Id della lezione non valido.');

  await deps.record(auth.userId, 'save', lessonId);
  const body = await readJsonBody(request, MAX_EXAM_BODY_BYTES, `${EXAM_PACK} è troppo grande.`);
  if (body instanceof Response) return body;
  const parsed = saveExamPackRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError(
      'INVALID_FEED',
      `${EXAM_PACK} non ha la forma attesa.`,
      {},
      zodIssues(parsed.error),
    );
  }
  if (parsed.data.lessonId.toLowerCase() !== lessonId) {
    return apiError('INVALID_REQUEST', 'La lezione del pacchetto non corrisponde al percorso.');
  }

  try {
    const result = await deps.saveExamPack(auth.userId, {
      ...parsed.data,
      lessonId,
      feedId: parsed.data.feedId.toLowerCase(),
    });
    const response: SaveExamPackResponse = { ...result };
    return apiOk(response, result.created ? 201 : 200);
  } catch (error) {
    return domainErrorResponse(error, deps, EXAM_PACK, NO_FEED);
  }
}

// ---------------------------------------------------------------------------
// Banche degli esercizi d'esame (M4)
// ---------------------------------------------------------------------------

const EXAM_BANK = "La banca d'esame";
const NO_SUBJECT = 'Materia senza feed tra quelle che hai importato: genera prima le lezioni.';

/**
 * `GET /api/generation/exam/subjects`: materie con almeno un feed, con i
 * concetti (in inglese) e se lo studente ha già una banca.
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListExamSubjects(
  request: Request,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  try {
    const subjects = await deps.listExamSubjects(auth.userId);
    const body: SubjectsForExamResponse = {
      subjects: subjects.map((subject) => ({
        ...subject,
        concepts: subject.concepts.map((concept) => ({ ...concept })),
      })),
    };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps, EXAM_BANK, NO_SUBJECT);
  }
}

/**
 * `POST /api/generation/exam/subjects/:id/bank`: salva la banca degli esercizi
 * della materia, privata dello studente.
 *
 * @param request - Richiesta HTTP (corpo: `saveExamBankRequestSchema`).
 * @param rawSubjectId - Id della materia dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleSaveExamBank(
  request: Request,
  rawSubjectId: string,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const subjectId = z.uuid().safeParse(rawSubjectId);
  if (!subjectId.success) return apiError('INVALID_REQUEST', 'Id della materia non valido.');

  await deps.record(auth.userId, 'save', null);
  const body = await readJsonBody(
    request,
    MAX_EXAM_BANK_BODY_BYTES,
    `${EXAM_BANK} è troppo grande.`,
  );
  if (body instanceof Response) return body;
  const parsed = saveExamBankRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError(
      'INVALID_FEED',
      `${EXAM_BANK} non ha la forma attesa.`,
      {},
      zodIssues(parsed.error),
    );
  }
  const id = subjectId.data.toLowerCase();
  if (parsed.data.subjectId.toLowerCase() !== id) {
    return apiError('INVALID_REQUEST', 'La materia della banca non corrisponde al percorso.');
  }

  try {
    const result = await deps.saveExamBank(auth.userId, { ...parsed.data, subjectId: id });
    const response: SaveExamBankResponse = { ...result };
    return apiOk(response, result.created ? 201 : 200);
  } catch (error) {
    return domainErrorResponse(error, deps, EXAM_BANK, NO_SUBJECT);
  }
}

const CORRECTION = 'La correzione';
const NO_SUBMISSION = 'Risposta da correggere non trovata (forse già corretta o scaduta).';

/**
 * `GET /api/generation/exam/submissions`: risposte dello studente ancora da
 * correggere, con consegna, soluzione modello e griglia.
 *
 * @param request - Richiesta HTTP.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListSubmissionsToCorrect(
  request: Request,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  await deps.record(auth.userId, 'read', null);
  try {
    const submissions = await deps.listSubmissionsToCorrect(auth.userId);
    // Forma di `submissionsResponseSchema` (tipi del dominio verificati nei contratti).
    return apiOk({ submissions });
  } catch (error) {
    return domainErrorResponse(error, deps, CORRECTION, NO_SUBMISSION);
  }
}

/**
 * `POST /api/generation/exam/submissions/:id/correction`: salva la correzione
 * di Claude (punti per criterio, commento e suggerimenti sulle righe).
 *
 * @param request - Richiesta HTTP (corpo: `saveCorrectionRequestSchema`).
 * @param rawId - Id dell'invio dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleSaveCorrection(
  request: Request,
  rawId: string,
  deps: GenerationHandlerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError('NOT_FOUND', NO_SUBMISSION);

  await deps.record(auth.userId, 'save', null);
  const body = await readJsonBody(
    request,
    MAX_CORRECTION_BODY_BYTES,
    `${CORRECTION} è troppo grande.`,
  );
  if (body instanceof Response) return body;
  const parsed = saveCorrectionRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError(
      'INVALID_FEED',
      `${CORRECTION} non ha la forma attesa.`,
      {},
      zodIssues(parsed.error),
    );
  }
  try {
    await deps.saveCorrection(auth.userId, id.data.toLowerCase(), parsed.data.correction);
    return apiOk({ saved: true }, 201);
  } catch (error) {
    return domainErrorResponse(error, deps, CORRECTION, NO_SUBMISSION);
  }
}
