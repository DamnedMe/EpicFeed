import 'server-only';
import { chooseSubject } from '../features/feed/feed-client';
import type { SubjectFeed } from '../features/feed/model';
import { feedPreview } from '../features/feed/model';
import type { UserId } from '@study-feed/core';
import type { FeedHandlerDeps } from './feed-handler';
import { subjectFeedBody } from './feed-handler';

/**
 * Prima schermata del feed disegnata sul server (ADR 0016): alla prima
 * apertura su un dispositivo senza copia della materia, la pagina arriva già
 * con la prima lezione, invece di aspettare script e API.
 *
 * @param userId - Studente.
 * @param deps - Servizi del feed.
 * @returns L'anteprima, oppure `null` (nessuna lezione pronta o errore: il
 * client carica come sempre).
 */
export async function loadFeedPreview(
  userId: UserId,
  deps: Pick<FeedHandlerDeps, 'listSubjects' | 'readSubjectFeed' | 'logError'>,
): Promise<SubjectFeed | null> {
  try {
    const subjects = await deps.listSubjects(userId);
    const subject = chooseSubject(subjects, null);
    if (!subject) return null;
    const { feed } = await deps.readSubjectFeed(userId, subject.subjectId);
    return feedPreview(subjectFeedBody(feed));
  } catch (error) {
    deps.logError(error);
    return null;
  }
}
