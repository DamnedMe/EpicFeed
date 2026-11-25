import 'server-only';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import type { CorrectionsHandlerDeps } from './corrections-handler';

/**
 * Collega gli handler di Segnala errore ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function correctionsDeps(): CorrectionsHandlerDeps {
  const services = getServices();
  return {
    currentUserId: async () => {
      const user = await getCurrentUser();
      // Chi non ha ancora impostato la password non è ancora entrato del tutto.
      return user?.hasPassword ? user.id : null;
    },
    listCorrections: (userId) => services.listCorrections.execute(userId, 'all'),
    reportError: (userId, input) => services.reportError.execute(userId, input),
    withdrawCorrection: (userId, id) => services.withdrawCorrection.execute(userId, id),
    logError: (error) => {
      console.error(
        'Correzioni non disponibili',
        error instanceof Error ? error.message : typeof error,
      );
    },
  };
}
