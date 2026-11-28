import 'server-only';
import { getServices } from '@/server/container';
import { generationAccessDeps } from '@/server/generation-deps';
import type { StudyGenerationDeps } from './study-generation-handler';

/**
 * Collega gli handler del feed per l'assistente di Claude Desktop ai servizi
 * reali. Il riallineamento dei minuti resta alla web app: qui si legge e basta.
 *
 * @returns Le dipendenze degli handler.
 */
export function studyGenerationDeps(): StudyGenerationDeps {
  const services = getServices();
  return {
    ...generationAccessDeps(),
    listSubjects: (userId) => services.listStudySubjects.execute(userId),
    readSubjectFeed: (userId, subjectId) => services.readSubjectFeed.execute(userId, subjectId),
  };
}
