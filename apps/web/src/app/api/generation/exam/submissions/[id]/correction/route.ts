import { handleSaveCorrection } from '@/features/exam/api/generation-handler';
import { examGenerationDeps } from '@/features/exam/api/generation-deps';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/exam/submissions/:id/correction`: salva la correzione di Claude (token "genera"). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleSaveCorrection(request, id, examGenerationDeps());
}
