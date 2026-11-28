import type { ReadSubjectFeedResult, StudySubject, StudySubjectsResponse } from '@epicfeed/feed';
import type { UserId } from '@epicfeed/shared';
import * as z from 'zod';
import { apiError, apiOk } from '@/server/http';
import type { GenerationAccessDeps } from '@/server/generation-api';
import { authorize, domainErrorResponse } from '@/server/generation-api';
import { subjectFeedBody } from './feed-handler';

/**
 * API del feed per l'assistente di studio di Claude Desktop (M6, ADR 0021),
 * con il token "genera": le stesse materie e lo stesso feed che scarica la
 * web app, così il server MCP cerca le lezioni, trova i concetti deboli e
 * prepara i quiz sul PC, senza ricerche sul server.
 */
export interface StudyGenerationDeps extends GenerationAccessDeps {
  listSubjects(userId: UserId): Promise<StudySubject[]>;
  readSubjectFeed(userId: UserId, subjectId: string): Promise<ReadSubjectFeedResult>;
}

const NO_SUBJECT = 'Materia non trovata tra quelle che hai importato.';

/**
 * `GET /api/generation/study/subjects`: materie con lezioni importate.
 *
 * @param request - Richiesta HTTP (token "genera").
 * @param deps - Servizi.
 * @returns La risposta HTTP (forma di `studySubjectsResponseSchema`).
 */
export async function handleListStudySubjects(
  request: Request,
  deps: StudyGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  await deps.record(auth.userId, 'read', null);
  try {
    const subjects = await deps.listSubjects(auth.userId);
    const body: StudySubjectsResponse = { subjects: subjects.map((subject) => ({ ...subject })) };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps, 'La materia', NO_SUBJECT);
  }
}

/**
 * `GET /api/generation/study/subjects/:id`: il feed di tutta la materia,
 * nella stessa forma della web app (`subjectFeedResponseSchema`).
 *
 * @param request - Richiesta HTTP (token "genera").
 * @param rawSubjectId - Id della materia dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleReadStudySubject(
  request: Request,
  rawSubjectId: string,
  deps: StudyGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const subjectId = z.uuid().safeParse(rawSubjectId);
  if (!subjectId.success) return apiError('NOT_FOUND', NO_SUBJECT);
  await deps.record(auth.userId, 'read', null);
  try {
    const result = await deps.readSubjectFeed(auth.userId, subjectId.data.toLowerCase());
    return apiOk(subjectFeedBody(result.feed));
  } catch (error) {
    return domainErrorResponse(error, deps, 'La materia', NO_SUBJECT);
  }
}
