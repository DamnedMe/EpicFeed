import type { CreateGenerateTokenResponse } from '@epicfeed/feed';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import { apiError, apiOk, isSameOrigin } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/generation/token`: crea un token "genera" (90 giorni) per il
 * server MCP di Claude Desktop. Il token in chiaro esce solo in questa
 * risposta: la pagina lo mostra una volta perché lo studente lo incolli nelle
 * impostazioni dell'estensione di Claude Desktop.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const user = await getCurrentUser({ verifyWithServer: true });
  if (!user?.hasPassword) return apiError('UNAUTHORIZED', 'Accedi per collegare Claude Desktop.');

  const issued = await getServices().generateTokens.issue(user.id, 'Claude Desktop');
  const body: CreateGenerateTokenResponse = {
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
  };
  return apiOk(body, 201);
}
