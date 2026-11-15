import {
  apiErrorSchema,
  importLessonResponseSchema,
  type ImportLessonRequest,
  type ImportLessonResponse,
} from '@study-feed/contracts';

/** Errore dell'API già tradotto in un messaggio per l'utente. */
export class ApiCallError extends Error {
  /**
   * @param message - Messaggio da mostrare.
   * @param code - Codice dell'API, se noto.
   */
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiCallError';
  }
}

/**
 * Invia la lezione a `POST /api/import` con il token di import.
 *
 * @param apiBaseUrl - Origine della web app.
 * @param token - Token di import.
 * @param payload - Lezione validata dai contratti.
 * @param fetchFn - `fetch` (iniettabile nei test).
 * @returns La risposta validata.
 * @throws {@link ApiCallError} con un messaggio comprensibile.
 */
export async function sendImport(
  apiBaseUrl: string,
  token: string,
  payload: ImportLessonRequest,
  fetchFn: typeof fetch = fetch,
): Promise<ImportLessonResponse> {
  let response: Response;
  try {
    response = await fetchFn(new URL('/api/import', apiBaseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      credentials: 'omit',
    });
  } catch {
    throw new ApiCallError('Study Feed non è raggiungibile: controlla la connessione.');
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(json);
    throw new ApiCallError(
      error.success ? error.data.error.message : `Errore del server (${response.status}).`,
      error.success ? error.data.error.code : undefined,
    );
  }
  const parsed = importLessonResponseSchema.safeParse(json);
  if (!parsed.success) throw new ApiCallError('Risposta inattesa da Study Feed.');
  return parsed.data;
}
