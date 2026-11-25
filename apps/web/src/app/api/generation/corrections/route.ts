import { correctionGenerationDeps } from '@/features/feed/api/correction-generation-deps';
import { handleListPendingCorrections } from '@/features/feed/api/correction-generation-handler';

export const dynamic = 'force-dynamic';

/** `GET /api/generation/corrections`: correzioni in attesa di Claude (token "genera"). */
export async function GET(request: Request): Promise<Response> {
  return handleListPendingCorrections(request, correctionGenerationDeps());
}
