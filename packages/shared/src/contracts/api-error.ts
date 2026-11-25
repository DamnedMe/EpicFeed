import * as z from 'zod';

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
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_FEED',
  'INTERNAL',
]);

/** Codice di errore delle API. */
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Corpo di ogni risposta di errore delle API. */
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string(),
    /** Problemi puntuali (solo `INVALID_FEED`): percorso dell'elemento e messaggio. */
    issues: z
      .array(z.strictObject({ path: z.string().max(200), message: z.string().max(500) }))
      .max(200)
      .optional(),
  }),
});

/** Corpo di ogni risposta di errore delle API. */
export type ApiError = z.infer<typeof apiErrorSchema>;
