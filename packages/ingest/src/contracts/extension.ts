import * as z from 'zod';

/**
 * Collegamento tra web app ed estensione.
 *
 * La pagina "Collega l'estensione" della web app, dopo il login, crea un token
 * di import e lo consegna all'estensione con `chrome.runtime.sendMessage`
 * (consentito solo dall'origine della web app, `externally_connectable`).
 * L'estensione risponde con un {@link extensionAckSchema}.
 */

/** Prefisso dei token di import: li rende riconoscibili da secret scanning e log. */
export const IMPORT_TOKEN_PREFIX = 'sfi_';

/** Token di import: prefisso + 43 caratteri base64url (32 byte casuali). */
export const importTokenSchema = z
  .string()
  .regex(/^sfi_[A-Za-z0-9_-]{43}$/, 'Token di import non valido');

/** Messaggio che la web app invia all'estensione per collegarla. */
export const extensionConnectMessageSchema = z.strictObject({
  type: z.literal('study-feed/connect'),
  token: importTokenSchema,
  expiresAt: z.iso.datetime(),
  apiBaseUrl: z.url({ protocol: /^https?$/ }),
});

/** Messaggio che la web app invia all'estensione per collegarla. */
export type ExtensionConnectMessage = z.infer<typeof extensionConnectMessageSchema>;

/** Risposta dell'estensione al collegamento. */
export const extensionAckSchema = z.strictObject({
  ok: z.boolean(),
  version: z.string().max(32).optional(),
});

/** Risposta dell'estensione al collegamento. */
export type ExtensionAck = z.infer<typeof extensionAckSchema>;

/** Risposta di `POST /api/extension/token`. */
export const createImportTokenResponseSchema = z.strictObject({
  token: importTokenSchema,
  expiresAt: z.iso.datetime(),
});

/** Risposta di `POST /api/extension/token`. */
export type CreateImportTokenResponse = z.infer<typeof createImportTokenResponseSchema>;
