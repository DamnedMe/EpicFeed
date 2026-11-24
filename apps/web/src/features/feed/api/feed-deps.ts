import 'server-only';
import { after } from 'next/server';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import type { FeedHandlerDeps } from './feed-handler';

/**
 * Collega gli handler del feed ai servizi reali. Il riallineamento dei minuti
 * gira con `after`, dopo che la risposta è partita: chi apre il feed non
 * aspetta, e alla visita successiva scarica le schede con i minuti nuovi.
 *
 * @returns Le dipendenze degli handler.
 */
export function feedDeps(): FeedHandlerDeps {
  const services = getServices();
  return {
    currentUserId: async () => {
      const user = await getCurrentUser();
      // Chi non ha ancora impostato la password non è ancora entrato del tutto.
      return user?.hasPassword ? user.id : null;
    },
    listSubjects: (userId) => services.listStudySubjects.execute(userId),
    readSubjectFeed: (userId, subjectId) => services.readSubjectFeed.execute(userId, subjectId),
    scheduleRealign: (userId, feeds) => {
      after(async () => {
        try {
          const result = await services.realignLessonFeeds.execute(userId, feeds);
          console.info('Minuti riallineati', result);
        } catch (error) {
          console.error(
            'Riallineamento fallito',
            error instanceof Error ? error.message : typeof error,
          );
        }
      });
    },
    logError: (error) => {
      console.error('Feed non disponibile', error instanceof Error ? error.message : typeof error);
    },
  };
}
