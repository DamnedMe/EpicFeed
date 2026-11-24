import * as z from 'zod';
import { getCurrentUser } from '@/server/auth';
import { getServices } from '@/server/container';
import { apiError, apiOk, isSameOrigin } from '@/server/http';

export const dynamic = 'force-dynamic';

/** `DELETE /api/extension/token/:id`: revoca un token dell'utente collegato. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isSameOrigin(request)) return apiError('FORBIDDEN', 'Richiesta non ammessa.');
  const user = await getCurrentUser({ verifyWithServer: true });
  if (!user) return apiError('UNAUTHORIZED', 'Accedi per gestire i token.');

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return apiError('INVALID_REQUEST', 'Token non valido.');
  const revoked = await getServices().tokens.revoke(user.id, id.data);
  return revoked ? apiOk({ revoked: true }) : apiError('INVALID_REQUEST', 'Token non trovato.');
}
