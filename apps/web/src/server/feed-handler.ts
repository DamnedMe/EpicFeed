import type {
  OutdatedFeed,
  ReadSubjectFeedResult,
  StudySubject,
  StudySubjectsResponse,
  SubjectFeedResponse,
} from '@epicfeed/feed';
import type { UserId } from '@epicfeed/shared';
import { DomainError, parseId } from '@epicfeed/shared';
import * as z from 'zod';
import { apiError, matchesEtag } from './http';

/**
 * Handler delle API del feed di studio (M3, ADR 0015), usati dalla web app con
 * la sessione dello studente. Sono funzioni pure rispetto alle dipendenze,
 * così si provano senza database né Next.js.
 */
export interface FeedHandlerDeps {
  /** Utente della sessione, oppure `null` se non autenticato. */
  readonly currentUserId: () => Promise<string | null>;
  readonly listSubjects: (userId: UserId) => Promise<StudySubject[]>;
  readonly readSubjectFeed: (userId: UserId, subjectId: string) => Promise<ReadSubjectFeedResult>;
  /**
   * Programma il riallineamento dei feed vecchi dopo la risposta (`after` di
   * Next.js): lo studente non aspetta, la volta dopo scarica i minuti nuovi.
   */
  readonly scheduleRealign: (userId: UserId, feeds: readonly OutdatedFeed[]) => void;
  readonly logError: (error: unknown) => void;
}

/**
 * Header delle risposte del feed: dati personali, quindi mai in cache
 * condivise; il browser li conserva ma deve chiedere ogni volta se sono
 * cambiati (ETag), così una materia invariata costa una risposta vuota.
 */
const PRIVATE_REVALIDATE = { 'Cache-Control': 'private, no-cache' };

async function authenticate(deps: FeedHandlerDeps): Promise<UserId | Response> {
  const userId = await deps.currentUserId();
  if (!userId) return apiError('UNAUTHORIZED', 'Accedi a EpicFeed per vedere il feed.');
  return parseId(userId, 'UserId');
}

/**
 * `GET /api/feed/subjects`: materie con lezioni importate.
 *
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleListSubjects(deps: FeedHandlerDeps): Promise<Response> {
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  try {
    const subjects = await deps.listSubjects(userId);
    const body: StudySubjectsResponse = { subjects: subjects.map((subject) => ({ ...subject })) };
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    deps.logError(error);
    return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
  }
}

/**
 * `GET /api/feed/subjects/:id`: il feed di tutta la materia. Risponde `304`
 * se l'app ha già la versione corrente.
 *
 * @param request - Richiesta HTTP (per `If-None-Match`).
 * @param rawSubjectId - Id della materia dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleReadSubjectFeed(
  request: Request,
  rawSubjectId: string,
  deps: FeedHandlerDeps,
): Promise<Response> {
  const userId = await authenticate(deps);
  if (userId instanceof Response) return userId;
  const subjectId = z.uuid().safeParse(rawSubjectId);
  if (!subjectId.success) return apiError('NOT_FOUND', 'Materia non trovata.');

  let result: ReadSubjectFeedResult;
  try {
    result = await deps.readSubjectFeed(userId, subjectId.data.toLowerCase());
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Materia non trovata tra quelle che hai importato.');
    }
    deps.logError(error);
    return apiError('INTERNAL', 'Errore del server. Riprova più tardi.');
  }

  if (result.outdated.length > 0) deps.scheduleRealign(userId, result.outdated);

  const etag = `"${result.feed.version}"`;
  const headers = { ...PRIVATE_REVALIDATE, ETag: etag };
  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  const { feed } = result;
  return Response.json(subjectFeedBody(feed), { headers });
}

/**
 * Materia nella forma della risposta dell'API (usata anche dalla prima
 * schermata del feed disegnata sul server).
 *
 * @param feed - Materia letta dal core.
 * @returns Il corpo della risposta.
 */
export function subjectFeedBody(feed: ReadSubjectFeedResult['feed']): SubjectFeedResponse {
  return {
    subjectId: feed.subjectId,
    title: feed.title,
    version: feed.version,
    chapters: feed.chapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      title: chapter.title,
      lessons: chapter.lessons.map((lesson) => ({
        lessonId: lesson.lessonId,
        title: lesson.title,
        position: lesson.position,
        portalUrl: lesson.portalUrl,
        // Gli id del portale restano sul server: all'app bastano i link.
        parts: lesson.parts.map((part) => ({
          partId: part.partId,
          title: part.title,
          kind: part.kind,
          position: part.position,
          portalUrl: part.portalUrl,
        })),
        feed: lesson.feed as SubjectFeedResponse['chapters'][number]['lessons'][number]['feed'],
      })),
    })),
  };
}
