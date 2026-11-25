import 'server-only';
import type { GenerationAccessDeps } from './generation-api';
import { getServices } from './container';

/**
 * Collega token, limite di frequenza e log della generazione ai servizi reali.
 * Il log non contiene mai il corpo della richiesta (contenuti Epicode, feed).
 *
 * @returns Le dipendenze comuni degli handler della generazione.
 */
export function generationAccessDeps(): GenerationAccessDeps {
  const services = getServices();
  return {
    verifyToken: (token) => services.generateTokens.verify(token),
    isAllowed: (userId) => services.generationRateLimiter.isAllowed(userId),
    record: (userId, action, lessonId) =>
      services.generationRateLimiter.record(userId, action, lessonId),
    logError: (error) => {
      console.error('Generazione fallita', error instanceof Error ? error.message : typeof error);
    },
  };
}
