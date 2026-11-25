import { handleListCatalog } from '@/features/feed/api/generation-handler';
import { feedGenerationDeps } from '@/features/feed/api/generation-deps';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/catalog`: lezioni importate, per abbinare le slide (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleListCatalog(request, feedGenerationDeps());
}
