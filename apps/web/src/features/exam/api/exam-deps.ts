import 'server-only';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import type { ExamHandlerDeps } from './exam-handler';

/**
 * Collega gli handler della sezione Esame ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function examDeps(): ExamHandlerDeps {
  const services = getServices();
  return {
    currentUserId: async () => {
      const user = await getCurrentUser();
      // Chi non ha ancora impostato la password non è ancora entrato del tutto.
      return user?.hasPassword ? user.id : null;
    },
    readExamContent: (userId, subjectId) => services.readExamContent.execute(userId, subjectId),
    submit: (userId, draft) => services.submitForCorrection.execute(userId, draft),
    listSubmissions: (userId) => services.listSubmissions.execute(userId, 'all'),
    deleteSubmission: (userId, id) => services.deleteSubmission.execute(userId, id),
    logError: (error) => {
      console.error('Esame non disponibile', error instanceof Error ? error.message : typeof error);
    },
  };
}
