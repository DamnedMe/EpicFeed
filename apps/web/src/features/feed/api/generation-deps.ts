import 'server-only';
import { getServices } from '@/server/container';
import { generationAccessDeps } from '@/server/generation-deps';
import type { FeedGenerationDeps } from './generation-handler';

/**
 * Collega gli handler della generazione del feed ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function feedGenerationDeps(): FeedGenerationDeps {
  const services = getServices();
  return {
    ...generationAccessDeps(),
    listLessons: (userId, limit) => services.listLessonsToGenerate.execute(userId, limit),
    readLesson: (userId, lessonId) => services.readLessonForGeneration.execute(userId, lessonId),
    saveFeed: (userId, input) => services.saveLessonFeed.execute(userId, input),
    listOwnedLessons: (userId) => services.listOwnedLessons.execute(userId),
    importSlides: (userId, lessonId, presentations) =>
      services.importLessonSlides.execute(userId, lessonId, presentations),
  };
}
