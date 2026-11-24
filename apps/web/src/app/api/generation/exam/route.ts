import { handleListExamLessons } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/generation/exam`: lezioni con un feed ma senza pacchetto d'esame
 * (server MCP, token "genera").
 */
export async function GET(request: Request): Promise<Response> {
  return handleListExamLessons(request, generationDeps());
}
