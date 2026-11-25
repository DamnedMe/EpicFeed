import 'server-only';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import type { ProgressHandlerDeps } from './progress-handler';

/**
 * Collega gli handler dei progressi ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function progressDeps(): ProgressHandlerDeps {
  return {
    currentUserId: async () => {
      const user = await getCurrentUser();
      return user?.hasPassword ? user.id : null;
    },
    repository: getServices().progress,
    logError: (error) => {
      console.error(
        'Progressi non disponibili',
        error instanceof Error ? error.message : typeof error,
      );
    },
  };
}
