import type {
  EncryptedProgressRepository,
  ProgressPutResponse,
  ProgressResponse,
} from '@epicfeed/review';
import { progressPutSchema } from '@epicfeed/review';
import { apiError, apiOk } from '@/server/http';
import type { GenerationAccessDeps } from '@/server/generation-api';
import { authorize, domainErrorResponse, readJsonBody } from '@/server/generation-api';
import { MAX_PROGRESS_BODY } from './progress-handler';

/**
 * Copia cifrata dei progressi per Claude Desktop (M6, ADR 0021), con il token
 * "genera". Il server la restituisce com'è: la decifra il server MCP sul PC
 * dello studente, con la password che lo studente ha scritto nelle
 * impostazioni dell'estensione. EpicFeed continua a non poterla leggere.
 * Le risposte dei quiz in chat tornano con `PUT`, cifrate sul PC.
 */
export interface ProgressGenerationDeps extends GenerationAccessDeps {
  readonly repository: Pick<EncryptedProgressRepository, 'get' | 'put'>;
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

/**
 * `PUT /api/generation/progress`: scrive la copia cifrata sul PC con le
 * risposte dei quiz in chat, solo se sul server c'è ancora la versione da cui
 * è partito il server MCP; altrimenti `409` e il server MCP rilegge, unisce e
 * riprova, come un dispositivo (ADR 0018).
 *
 * @param request - Richiesta HTTP (token "genera", corpo: `progressPutSchema`).
 * @param deps - Servizi.
 * @returns La risposta HTTP (forma di `progressPutResponseSchema`).
 */
export async function handleWriteProgressForClaude(
  request: Request,
  deps: ProgressGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  await deps.record(auth.userId, 'save', null);
  const body = await readJsonBody(
    request,
    MAX_PROGRESS_BODY,
    'I progressi superano lo spazio previsto.',
  );
  if (body instanceof Response) return body;
  const parsed = progressPutSchema.safeParse(body.json);
  if (!parsed.success) return apiError('INVALID_REQUEST', 'La copia non ha la forma attesa.');
  const { baseRevision, ...data } = parsed.data;
  try {
    const revision = await deps.repository.put(auth.userId, data, baseRevision);
    if (revision === null) {
      return apiError('CONFLICT', 'I progressi sono cambiati su un altro dispositivo.');
    }
    const result: ProgressPutResponse = { revision };
    return apiOk(result);
  } catch (error) {
    return domainErrorResponse(error, deps);
  }
}
