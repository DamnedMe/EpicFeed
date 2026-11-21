import { handleListCatalog } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/catalog`: lezioni importate, per abbinare le slide (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleListCatalog(request, generationDeps());
}
