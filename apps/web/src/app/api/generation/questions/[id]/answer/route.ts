import { questionGenerationDeps } from '@/features/assistant/api/question-generation-deps';
import { handleAnswerQuestion } from '@/features/assistant/api/question-generation-handler';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/questions/:id/answer`: risposta di Claude Desktop (token "genera"). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleAnswerQuestion(request, id, questionGenerationDeps());
}
