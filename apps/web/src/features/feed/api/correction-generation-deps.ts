import 'server-only';
import { getServices } from '@/server/container';
import { generationAccessDeps } from '@/server/generation-deps';
import type { CorrectionGenerationDeps } from './correction-generation-handler';

/**
 * Collega gli handler delle correzioni per Claude Desktop ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function correctionGenerationDeps(): CorrectionGenerationDeps {
  const services = getServices();
  return {
    ...generationAccessDeps(),
    listPendingCorrections: (userId) => services.listCorrections.execute(userId, 'pending'),
    completeCorrection: (userId, id, completion) =>
      services.completeCorrection.execute(userId, id, completion),
    reportError: (userId, input) => services.reportError.execute(userId, input),
  };
}
