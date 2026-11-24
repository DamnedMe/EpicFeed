import 'server-only';
import { getCurrentUser } from './auth';
import { getServices } from './container';
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
    logError: (error) => {
      console.error('Esame non disponibile', error instanceof Error ? error.message : typeof error);
    },
  };
}
