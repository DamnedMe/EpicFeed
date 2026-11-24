import { handleSaveFeed } from '@/features/feed/api/generation-handler';
import { feedGenerationDeps } from '@/features/feed/api/generation-deps';

export const dynamic = 'force-dynamic';

/** `POST /api/generation/lessons/:id/feed`: salva il feed generato (token "genera"). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleSaveFeed(request, (await params).id, feedGenerationDeps());
}
