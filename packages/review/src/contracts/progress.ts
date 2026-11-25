import * as z from 'zod';

/**
 * Contratto dell'API dei progressi sincronizzati (M4, ADR 0018): la web app
 * manda e riceve una copia **già cifrata** nel browser. Il server controlla
 * solo forma e dimensioni; il contenuto non lo può leggere.
 */

/** Come si ricava la chiave dalla password (vedi ADR 0018). */
export const PROGRESS_KDF = 'pbkdf2-sha256-600000';

/** Massimo del testo cifrato, in caratteri base64 (~3 MB di dati). */
export const MAX_PROGRESS_CIPHERTEXT = 4_000_000;

const base64 = (length: z.ZodString) => length.regex(/^[A-Za-z0-9+/]+={0,2}$/);

/** Parte cifrata della copia, uguale in lettura e scrittura. */
export const encryptedProgressSchema = z.strictObject({
  kdf: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** 16 byte casuali, nuovi a ogni scrittura (HKDF). */
  salt: base64(z.string().length(24)),
  /** 12 byte casuali di AES-GCM, nuovi a ogni scrittura. */
  iv: base64(z.string().length(16)),
  ciphertext: base64(z.string().min(24).max(MAX_PROGRESS_CIPHERTEXT)),
});
/** Parte cifrata della copia. */
export type EncryptedProgress = z.infer<typeof encryptedProgressSchema>;

/** `GET /api/progress`: la copia sul server (404 se non c'è). */
export const progressResponseSchema = encryptedProgressSchema.extend({
  revision: z.number().int().min(1),
});
/** Corpo di `GET /api/progress`. */
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

/**
 * `PUT /api/progress`: scrive la copia solo se sul server c'è ancora
 * `baseRevision` (`null` = nessuna copia), altrimenti `409`.
 */
export const progressPutSchema = encryptedProgressSchema.extend({
  baseRevision: z.number().int().min(1).nullable(),
});
/** Corpo di `PUT /api/progress`. */
export type ProgressPut = z.infer<typeof progressPutSchema>;

/** Risposta di `PUT /api/progress`. */
export const progressPutResponseSchema = z.strictObject({
  revision: z.number().int().min(1),
});
/** Risposta di `PUT /api/progress`. */
export type ProgressPutResponse = z.infer<typeof progressPutResponseSchema>;
