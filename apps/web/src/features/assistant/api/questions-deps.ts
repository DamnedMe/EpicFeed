import 'server-only';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import type { QuestionsHandlerDeps } from './questions-handler';

/**
 * Collega gli handler delle domande in coda ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function questionsDeps(): QuestionsHandlerDeps {
  const services = getServices();
  return {
    currentUserId: async () => {
      const user = await getCurrentUser();
      // Chi non ha ancora impostato la password non è ancora entrato del tutto.
      return user?.hasPassword ? user.id : null;
    },
    listQuestions: (userId) => services.listQuestions.execute(userId, 'all'),
    askQuestion: (userId, input) => services.askQuestion.execute(userId, input),
    deleteQuestion: (userId, id) => services.deleteQuestion.execute(userId, id),
    logError: (error) => {
      console.error(
        'Domande non disponibili',
        error instanceof Error ? error.message : typeof error,
      );
    },
  };
}
