import type { ApiErrorCode } from '@epicfeed/contracts';

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INVALID_CONTENT: 422,
  ENTITLEMENT_MISMATCH: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_FEED: 422,
  INTERNAL: 500,
};

/** Problema puntuale allegato a un errore `INVALID_FEED`. */
export interface ApiIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Risposta di errore nel formato comune delle API (`apiErrorSchema`).
 *
 * @param code - Codice stabile dell'errore.
 * @param message - Messaggio per l'utente (mai dettagli interni).
 * @param headers - Header aggiuntivi (es. `Retry-After`).
 * @param issues - Problemi puntuali (solo per `INVALID_FEED`).
 * @returns La risposta HTTP.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  headers: Record<string, string> = {},
  issues?: readonly ApiIssue[],
): Response {
  return Response.json(
    { error: issues ? { code, message, issues } : { code, message } },
    { status: STATUS[code], headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

/**
 * Risposta JSON riuscita, mai in cache (contiene dati personali).
 *
 * @param body - Corpo della risposta.
 * @param status - Codice HTTP.
 * @returns La risposta HTTP.
 */
export function apiOk(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Verifica che una richiesta che usa i cookie di sessione arrivi dalla web app
 * stessa (difesa da CSRF, oltre a `SameSite=Lax` dei cookie di Supabase).
 *
 * @param request - Richiesta in arrivo.
 * @returns `true` se l'header `Origin` coincide con l'host della richiesta.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * Estrae il token da `Authorization: Bearer …`.
 *
 * @param request - Richiesta in arrivo.
 * @returns Il token, oppure `null` se l'header manca o non è Bearer.
 */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  return match?.[1] ?? null;
}

/**
 * Legge il corpo come testo fermandosi oltre `limit` byte, anche se
 * `Content-Length` manca o mente.
 *
 * @param request - Richiesta in arrivo.
 * @param limit - Massimo di byte accettati.
 * @returns Il corpo, oppure `null` se supera il limite.
 */
export async function readLimited(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * `true` se il valore di `If-None-Match` corrisponde all'ETag (anche in forma
 * debole o in elenco): l'app ha già la versione corrente.
 *
 * @param header - Valore dell'header, se c'è.
 * @param etag - ETag della risposta, tra virgolette.
 * @returns `true` se si può rispondere `304`.
 */
export function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === etag || value === '*');
}
