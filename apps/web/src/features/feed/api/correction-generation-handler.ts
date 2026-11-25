import type { CorrectionCompletion, StoredCorrection } from '@epicfeed/feed';
import type { UserId } from '@epicfeed/shared';
import { completeCorrectionRequestSchema, MAX_CORRECTION_REQUEST_BYTES } from '@epicfeed/feed';
import * as z from 'zod';
import { apiError, apiOk } from '@/server/http';
import type { GenerationAccessDeps } from '@/server/generation-api';
import { authorize, domainErrorResponse, readJsonBody, zodIssues } from '@/server/generation-api';

/**
 * API delle correzioni per Claude Desktop (M5, ADR 0020), con il token
 * "genera": le correzioni in attesa (altra lingua da allineare, schede da
 * rifare) e il salvataggio del lavoro di Claude.
 */
export interface CorrectionGenerationDeps extends GenerationAccessDeps {
  /** Correzioni dello studente in attesa di Claude. */
  listPendingCorrections(userId: UserId): Promise<StoredCorrection[]>;
  completeCorrection(userId: UserId, id: string, completion: CorrectionCompletion): Promise<void>;
}

const CORRECTION = 'La correzione';
const NO_CORRECTION = 'Correzione non trovata.';

/**
 * `GET /api/generation/corrections`: correzioni in attesa di Claude, con
 * l'elemento come lo vedeva lo studente.
 *
 * @param request - Richiesta HTTP (token "genera").
 * @param deps - Servizi.
 * @returns La risposta HTTP (forma di `correctionsResponseSchema`).
 */
export async function handleListPendingCorrections(
  request: Request,
  deps: CorrectionGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  await deps.record(auth.userId, 'read', null);
  try {
    return apiOk({ corrections: await deps.listPendingCorrections(auth.userId) });
  } catch (error) {
    return domainErrorResponse(error, deps, CORRECTION, NO_CORRECTION);
  }
}

/**
 * `POST /api/generation/corrections/:id/completion`: salva il lavoro di
 * Claude (la frase nell'altra lingua, la scheda rifatta, oppure una nota se
 * la correzione non trova riscontro nei riassunti).
 *
 * @param request - Richiesta HTTP (corpo: `completeCorrectionRequestSchema`).
 * @param rawId - Id della correzione dal percorso.
 * @param deps - Servizi.
 * @returns La risposta HTTP.
 */
export async function handleCompleteCorrection(
  request: Request,
  rawId: string,
  deps: CorrectionGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError('NOT_FOUND', NO_CORRECTION);

  await deps.record(auth.userId, 'save', null);
  const body = await readJsonBody(
    request,
    MAX_CORRECTION_REQUEST_BYTES,
    `${CORRECTION} è troppo grande.`,
  );
  if (body instanceof Response) return body;
  const parsed = completeCorrectionRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError(
      'INVALID_FEED',
      `${CORRECTION} non ha la forma attesa.`,
      {},
      zodIssues(parsed.error),
    );
  }
  try {
    await deps.completeCorrection(auth.userId, id.data.toLowerCase(), parsed.data.completion);
    return apiOk({ saved: true }, 201);
  } catch (error) {
    return domainErrorResponse(error, deps, CORRECTION, NO_CORRECTION);
  }
}
