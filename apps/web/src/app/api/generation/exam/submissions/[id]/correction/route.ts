import { handleSaveCorrection } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/exam/submissions/:id/correction`: salva la correzione di Claude (token "genera"). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleSaveCorrection(request, id, generationDeps());
}
