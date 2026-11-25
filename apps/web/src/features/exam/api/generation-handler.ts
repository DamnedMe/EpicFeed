import type {
  ExamCorrectionDraft,
  StoredSubmission,
  LessonExamMaterial,
  LessonsForExamResult,
  SaveExamBankInput,
  SaveExamBankResult,
  SubjectForExam,
  SaveExamPackInput,
  SaveExamPackResult,
  LessonForExamResponse,
  LessonsForExamResponse,
  SaveExamBankResponse,
  SubjectsForExamResponse,
  SaveExamPackResponse,
} from '@epicfeed/exam';
import type { LessonId, UserId } from '@epicfeed/shared';
import {
  MAX_CORRECTION_BODY_BYTES,
  saveCorrectionRequestSchema,
  MAX_EXAM_BANK_BODY_BYTES,
  MAX_EXAM_BODY_BYTES,
  saveExamBankRequestSchema,
  saveExamPackRequestSchema,
} from '@epicfeed/exam';
import * as z from 'zod';
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
 * API della generazione per l'esame (M4, ADR 0014 e 0017): pacchetti d'esame,
 * banche degli esercizi e correzioni di Claude Desktop, con il token "genera".
 */

/** Dipendenze degli handler della generazione per l'esame: tutte sostituibili nei test. */
export interface ExamGenerationDeps extends GenerationAccessDeps {
  listExamLessons(userId: UserId, limit: number): Promise<LessonsForExamResult>;
  readLessonForExam(userId: UserId, lessonId: LessonId): Promise<LessonExamMaterial>;
  saveExamPack(userId: UserId, input: SaveExamPackInput): Promise<SaveExamPackResult>;
  listExamSubjects(userId: UserId): Promise<SubjectForExam[]>;
  saveExamBank(userId: UserId, input: SaveExamBankInput): Promise<SaveExamBankResult>;
  /** Risposte dello studente ancora da correggere. */
  listSubmissionsToCorrect(userId: UserId): Promise<StoredSubmission[]>;
  saveCorrection(userId: UserId, id: string, correction: ExamCorrectionDraft): Promise<void>;
}

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
  deps: ExamGenerationDeps,
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
  deps: ExamGenerationDeps,
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
  deps: ExamGenerationDeps,
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
  deps: ExamGenerationDeps,
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
  deps: ExamGenerationDeps,
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
  deps: ExamGenerationDeps,
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
  deps: ExamGenerationDeps,
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
