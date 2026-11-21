import { handleSaveFeed } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/lessons/:id/feed`: salva il feed generato (token "genera"). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleSaveFeed(request, (await params).id, generationDeps());
}
