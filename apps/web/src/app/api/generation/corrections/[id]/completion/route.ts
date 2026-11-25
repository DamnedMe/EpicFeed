import { correctionGenerationDeps } from '@/features/feed/api/correction-generation-deps';
import { handleCompleteCorrection } from '@/features/feed/api/correction-generation-handler';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/corrections/:id/completion`: salva il lavoro di Claude (token "genera"). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleCompleteCorrection(request, id, correctionGenerationDeps());
}
