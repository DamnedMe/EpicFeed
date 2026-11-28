import type { CorrectionCompletion, ReportErrorInput, StoredCorrection } from '@epicfeed/feed';
import type { UserId } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import {
  completeCorrectionRequestSchema,
  MAX_CORRECTION_REQUEST_BYTES,
  reportErrorRequestSchema,
} from '@epicfeed/feed';
import * as z from 'zod';
import { apiError, apiOk } from '@/server/http';
import type { GenerationAccessDeps } from '@/server/generation-api';
import { authorize, domainErrorResponse, readJsonBody, zodIssues } from '@/server/generation-api';

/**
 * API delle correzioni per Claude Desktop (M5, ADR 0020), con il token
 * "genera": le correzioni in attesa (altra lingua da allineare, schede da
 * rifare), il salvataggio del lavoro di Claude e, da M6 (ADR 0021), le
 * correzioni che lo studente chiede a Claude in chat (`segnala_errore`).
 */
export interface CorrectionGenerationDeps extends GenerationAccessDeps {
  /** Correzioni dello studente in attesa di Claude. */
  listPendingCorrections(userId: UserId): Promise<StoredCorrection[]>;
  completeCorrection(userId: UserId, id: string, completion: CorrectionCompletion): Promise<void>;
  /** Salva una correzione dello studente (lo stesso caso d'uso della web app). */
  reportError(
    userId: UserId,
    input: ReportErrorInput,
  ): Promise<{ correction: StoredCorrection; created: boolean }>;
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

/**
 * `POST /api/generation/corrections`: salva una correzione che lo studente ha
 * chiesto a Claude in chat e confermato (M6, ADR 0021). È una correzione
 * dello studente come quelle della web app: compare in *Le mie segnalazioni*
 * e si può annullare. Reinviare lo stesso id restituisce quella già salvata.
 *
 * @param request - Richiesta HTTP (token "genera", corpo: `reportErrorRequestSchema`).
 * @param deps - Servizi.
 * @returns `201` se nuova, `200` se c'era già, con la correzione salvata.
 */
export async function handleReportErrorFromClaude(
  request: Request,
  deps: CorrectionGenerationDeps,
): Promise<Response> {
  const auth = await authorize(request, deps);
  if ('response' in auth) return auth.response;
  await deps.record(auth.userId, 'save', null);
  const body = await readJsonBody(
    request,
    MAX_CORRECTION_REQUEST_BYTES,
    `${CORRECTION} è troppo grande.`,
  );
  if (body instanceof Response) return body;
  const parsed = reportErrorRequestSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError(
      'INVALID_FEED',
      `${CORRECTION} non ha la forma attesa.`,
      {},
      zodIssues(parsed.error),
    );
  }
  const { id, subjectId, correction } = parsed.data;
  try {
    const result = await deps.reportError(auth.userId, {
      id: id.toLowerCase(),
      subjectId: subjectId.toLowerCase(),
      correction:
        correction.kind === 'term'
          ? correction
          : { ...correction, lessonId: correction.lessonId.toLowerCase() },
    });
    return apiOk({ correction: result.correction }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'LIMIT_REACHED') {
      return apiError('CONFLICT', error.message);
    }
    if (error instanceof DomainError && error.code === 'ALREADY_DONE') {
      return apiError('CONFLICT', 'Id della correzione già in uso: riprova con un id nuovo.');
    }
    return domainErrorResponse(
      error,
      deps,
      CORRECTION,
      'Lezione non trovata tra quelle che hai importato.',
    );
  }
}
