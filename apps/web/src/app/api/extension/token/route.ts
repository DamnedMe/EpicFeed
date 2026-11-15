import type { CreateImportTokenResponse } from '@study-feed/contracts';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import { apiError, apiOk, isSameOrigin } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/extension/token`: crea un token di import per l'utente collegato.
 * Il token in chiaro esce solo in questa risposta; la pagina lo passa subito
 * all'estensione e non lo salva.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const user = await getCurrentUser();
  if (!user?.hasPassword) return apiError('UNAUTHORIZED', 'Accedi per collegare l’estensione.');

  const issued = await getServices().tokens.issue(user.id, 'Estensione Chrome');
  const body: CreateImportTokenResponse = {
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
  };
  return apiOk(body, 201);
}
