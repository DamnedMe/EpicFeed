import { z } from 'zod';

/**
 * Codici di errore delle API. Stabili: estensione e web app mostrano il
 * messaggio giusto in base al codice, non al testo.
 */
export const apiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INVALID_REQUEST',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INVALID_CONTENT',
  'ENTITLEMENT_MISMATCH',
  'INTERNAL',
]);

/** Codice di errore delle API. */
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Corpo di ogni risposta di errore delle API. */
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});

/** Corpo di ogni risposta di errore delle API. */
export type ApiError = z.infer<typeof apiErrorSchema>;
