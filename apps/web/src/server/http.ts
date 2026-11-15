import type { ApiErrorCode } from '@study-feed/contracts';

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INVALID_CONTENT: 422,
  ENTITLEMENT_MISMATCH: 403,
  INTERNAL: 500,
};

/**
 * Risposta di errore nel formato comune delle API (`apiErrorSchema`).
 *
 * @param code - Codice stabile dell'errore.
 * @param message - Messaggio per l'utente (mai dettagli interni).
 * @param headers - Header aggiuntivi (es. `Retry-After`).
 * @returns La risposta HTTP.
 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
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
