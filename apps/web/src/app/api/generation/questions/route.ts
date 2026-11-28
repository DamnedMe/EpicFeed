import { questionGenerationDeps } from '@/features/assistant/api/question-generation-deps';
import { handleListPendingQuestions } from '@/features/assistant/api/question-generation-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/questions`: domande in attesa di Claude Desktop (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleListPendingQuestions(request, questionGenerationDeps());
}
