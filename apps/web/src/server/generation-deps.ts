import 'server-only';
import type { GenerationHandlerDeps } from './generation-handler';
import { getServices } from './container';

/**
 * Collega gli handler della generazione ai servizi reali. Il log non
 * contiene mai il corpo della richiesta (contenuti Epicode, feed).
 *
 * @returns Le dipendenze degli handler.
 */
export function generationDeps(): GenerationHandlerDeps {
  const services = getServices();
  return {
    verifyToken: (token) => services.generateTokens.verify(token),
    isAllowed: (userId) => services.generationRateLimiter.isAllowed(userId),
    record: (userId, action, lessonId) =>
      services.generationRateLimiter.record(userId, action, lessonId),
    listLessons: (userId, limit) => services.listLessonsToGenerate.execute(userId, limit),
    readLesson: (userId, lessonId) => services.readLessonForGeneration.execute(userId, lessonId),
    saveFeed: (userId, input) => services.saveLessonFeed.execute(userId, input),
    listOwnedLessons: (userId) => services.listOwnedLessons.execute(userId),
    importSlides: (userId, lessonId, presentations) =>
      services.importLessonSlides.execute(userId, lessonId, presentations),
    logError: (error) => {
      console.error('Generazione fallita', error instanceof Error ? error.message : typeof error);
    },
  };
}
