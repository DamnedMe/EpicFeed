import type { EncryptedProgressRepository, ProgressResponse } from '@epicfeed/review';
import { apiError, apiOk } from '@/server/http';
import type { GenerationAccessDeps } from '@/server/generation-api';
import { authorize, domainErrorResponse } from '@/server/generation-api';

/**
 * Copia cifrata dei progressi per Claude Desktop (M6, ADR 0021), con il token
 * "genera". Il server la restituisce com'è: la decifra il server MCP sul PC
 * dello studente, con la password che lo studente ha scritto nelle
 * impostazioni dell'estensione. EpicFeed continua a non poterla leggere.
 */
export interface ProgressGenerationDeps extends GenerationAccessDeps {
  readonly repository: Pick<EncryptedProgressRepository, 'get'>;
}

/**
 * `GET /api/generation/progress`: la copia cifrata, `404` se lo studente non
 * ha ancora sincronizzato i progressi da un dispositivo.
 *
 * @param request - Richiesta HTTP (token "genera").
 * @param deps - Servizi.
 * @returns La risposta HTTP (forma di `progressResponseSchema`).
 */
export async function handleReadProgressForClaude(
  request: Request,
  deps: ProgressGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  await deps.record(auth.userId, 'read', null);
  try {
    const stored = await deps.repository.get(auth.userId);
    if (!stored) {
      return apiError(
        'NOT_FOUND',
        'Nessuna copia dei progressi sul server: apri il Ripasso nell’app con la password per sincronizzarli.',
      );
    }
    const body: ProgressResponse = { ...stored };
    return apiOk(body);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}
