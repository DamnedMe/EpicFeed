import { handleListLessons } from '@/server/generation-handler';
import { generationDeps } from '@/server/generation-deps';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/generation/lessons`: lezioni da generare (server MCP, token
 * "genera"). Nessun header CORS: la chiama solo il server MCP sul PC, mai un
 * sito dal browser.
 */
export async function GET(request: Request): Promise<Response> {
  return handleListLessons(request, generationDeps());
}
