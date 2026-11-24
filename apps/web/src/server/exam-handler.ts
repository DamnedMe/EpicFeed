import type { ExamContent, ExamSubmissionDraft, StoredSubmission, UserId } from '@study-feed/core';
import { DomainError, parseId } from '@study-feed/core';
import { examSubmissionRequestSchema, MAX_SUBMISSION_BODY_BYTES } from '@study-feed/contracts';
import { z } from 'zod';
import { apiError, apiOk, isSameOrigin, matchesEtag, readLimited } from './http';

/**
 * Handler della sezione Esame (M4, ADR 0017), usati dalla web app con la
 * sessione dello studente. Funzioni pure rispetto alle dipendenze, provate
 * senza database né Next.js.
 */
export interface ExamHandlerDeps {
  /** Utente della sessione, oppure `null` se non autenticato. */
  readonly currentUserId: () => Promise<string | null>;
  readonly readExamContent: (userId: UserId, subjectId: string) => Promise<ExamContent>;
  /** Mette in coda le risposte per la correzione di Claude. */
  readonly submit: (userId: UserId, draft: ExamSubmissionDraft) => Promise<{ id: string }>;
  /** Invii dello studente, corretti e no. */
  readonly listSubmissions: (userId: UserId) => Promise<StoredSubmission[]>;
  readonly deleteSubmission: (userId: UserId, id: string) => Promise<void>;
  readonly logError: (error: unknown) => void;
}

async function authenticate(deps: ExamHandlerDeps): Promise<UserId | Response> {
  const rawUser = await deps.currentUserId();
  if (!rawUser) return apiError('UNAUTHORIZED', 'Accedi a EpicFeed per vedere l’esame.');
  return parseId(rawUser, 'UserId');
}

/** Errori inattesi: registrati, senza dettagli nella risposta. */
function internal(error: unknown, deps: ExamHandlerDeps): Response {
  deps.logError(error);
  return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
}

/**
 * `GET /api/exam/subjects/:id`: pacchetti d'esame delle lezioni e banca degli
 * esercizi dello studente. Come il feed, risponde `304` se l'app ha già la
 * versione corrente; dati personali, quindi mai in cache condivise.
 *
 * @param request - Richiesta HTTP (per `If-None-Match`).
 * @param rawSubjectId - Id della materia dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleReadExamContent(
  request: Request,
  rawSubjectId: string,
  deps: ExamHandlerDeps,
): Promise<Response> {
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  const subjectId = z.uuid().safeParse(rawSubjectId);
  if (!subjectId.success) return apiError('NOT_FOUND', 'Materia non trovata.');

  let content: ExamContent;
  try {
    content = await deps.readExamContent(userId, subjectId.data.toLowerCase());
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Materia non trovata tra quelle che hai importato.');
    }
    return internal(error, deps);
  }

  const etag = `"${content.version}"`;
  const headers = { 'Cache-Control': 'private, no-cache', ETag: etag };
  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  // Forma di `examContentResponseSchema`: i tipi del dominio coincidono con
  // quelli dei contratti (verifica in fase di compilazione in `contracts`).
  const body = {
    subjectId: content.subjectId,
    version: content.version,
    packs: content.packs,
    bank: content.bank,
  };
  return Response.json(body, { headers });
}

/**
 * `POST /api/exam/submissions`: invia risposte a Claude per la correzione
 * (*Fai correggere a Claude*). Solo dalla web app stessa.
 *
 * @param request - Richiesta HTTP (corpo: `examSubmissionRequestSchema`).
 * @param deps - Servizi.
 * @returns `201` con l'id dell'invio.
 */
export async function handleSubmitForCorrection(
  request: Request,
  deps: ExamHandlerDeps,
): Promise<Response> {
  // Cookie di sessione: solo dalla web app stessa (difesa da CSRF).
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;

  const declared = Number(request.headers.get('content-length') ?? 0);
  const raw =
    declared > MAX_SUBMISSION_BODY_BYTES
      ? null
      : await readLimited(request, MAX_SUBMISSION_BODY_BYTES);
  if (raw === null) return apiError('PAYLOAD_TOO_LARGE', 'Le risposte sono troppo lunghe.');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError('INVALID_REQUEST', 'Il corpo della richiesta non è JSON valido.');
  }
  const parsed = examSubmissionRequestSchema.safeParse(json);
  if (!parsed.success) return apiError('INVALID_REQUEST', 'Le risposte non hanno la forma attesa.');

  try {
    const { id } = await deps.submit(userId, {
      ...parsed.data,
      subjectId: parsed.data.subjectId.toLowerCase(),
    });
    return apiOk({ id }, 201);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Materia non trovata tra quelle che hai importato.');
    }
    if (error instanceof DomainError && error.code === 'LIMIT_REACHED') {
      return apiError('CONFLICT', error.message);
    }
    return internal(error, deps);
  }
}

/**
 * `GET /api/exam/submissions`: invii dello studente con le
 * correzioni arrivate; l'app le conserva e poi cancella gli invii.
 *
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListMySubmissions(deps: ExamHandlerDeps): Promise<Response> {
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  try {
    // Forma di `submissionsResponseSchema` (tipi del dominio verificati nei contratti).
    return apiOk({ submissions: await deps.listSubmissions(userId) });
  } catch (error) {
    return internal(error, deps);
  }
}

/**
 * `DELETE /api/exam/submissions/:id`: l'app ha conservato la correzione (o
 * rinuncia all'invio) e il server la dimentica.
 *
 * @param request - Richiesta HTTP.
 * @param rawId - Id dell'invio dal percorso.
 * @param deps - Servizi.
 * @returns `204`, oppure `404`.
 */
export async function handleDeleteSubmission(
  request: Request,
  rawId: string,
  deps: ExamHandlerDeps,
): Promise<Response> {
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError('NOT_FOUND', 'Risposta non trovata.');
  try {
    await deps.deleteSubmission(userId, id.data.toLowerCase());
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Risposta non trovata.');
    }
    return internal(error, deps);
  }
}
