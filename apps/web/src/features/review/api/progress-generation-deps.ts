import 'server-only';
import { getServices } from '@/server/container';
import { generationAccessDeps } from '@/server/generation-deps';
import type { ProgressGenerationDeps } from './progress-generation-handler';

/**
 * Collega la copia dei progressi per Claude Desktop ai servizi reali.
 *
 * @returns Le dipendenze dell'handler.
 */
export function progressGenerationDeps(): ProgressGenerationDeps {
  return { ...generationAccessDeps(), repository: getServices().progress };
}
