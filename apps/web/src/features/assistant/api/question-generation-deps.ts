import 'server-only';
import { getServices } from '@/server/container';
import { generationAccessDeps } from '@/server/generation-deps';
import type { QuestionGenerationDeps } from './question-generation-handler';

/**
 * Collega gli handler delle domande per Claude Desktop ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function questionGenerationDeps(): QuestionGenerationDeps {
  const services = getServices();
  return {
    ...generationAccessDeps(),
    listPendingQuestions: (userId) => services.listQuestions.execute(userId, 'pending'),
    answerQuestion: (userId, id, answer) => services.answerQuestion.execute(userId, id, answer),
  };
}
