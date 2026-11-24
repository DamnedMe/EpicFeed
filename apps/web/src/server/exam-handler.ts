import type { ExamContent, UserId } from '@study-feed/core';
import { DomainError, parseId } from '@study-feed/core';
import { z } from 'zod';
import { apiError, matchesEtag } from './http';

/**
 * Handler della sezione Esame (M4, ADR 0017), usati dalla web app con la
 * sessione dello studente. Funzioni pure rispetto alle dipendenze, provate
 * senza database né Next.js.
 */
export interface ExamHandlerDeps {
  /** Utente della sessione, oppure `null` se non autenticato. */
  readonly currentUserId: () => Promise<string | null>;
  readonly readExamContent: (userId: UserId, subjectId: string) => Promise<ExamContent>;
  readonly logError: (error: unknown) => void;
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
  const rawUser = await deps.currentUserId();
  if (!rawUser) return apiError('UNAUTHORIZED', 'Accedi a EpicFeed per vedere l’esame.');
  const userId = parseId(rawUser, 'UserId');
  const subjectId = z.uuid().safeParse(rawSubjectId);
  if (!subjectId.success) return apiError('NOT_FOUND', 'Materia non trovata.');

  let content: ExamContent;
  try {
    content = await deps.readExamContent(userId, subjectId.data.toLowerCase());
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Materia non trovata tra quelle che hai importato.');
    }
    deps.logError(error);
    return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
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
