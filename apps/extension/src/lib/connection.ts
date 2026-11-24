import { extensionConnectMessageSchema, type ExtensionConnectMessage } from '@epicfeed/contracts';

/** Collegamento con la web app salvato in `storage.local` (mai sincronizzato). */
export type Connection = Pick<ExtensionConnectMessage, 'token' | 'expiresAt' | 'apiBaseUrl'>;

/**
 * Valida il messaggio di collegamento inviato dalla web app: forma corretta e
 * `apiBaseUrl` uguale all'origine che l'ha inviato (una pagina non può
 * dirottare gli import verso un altro server).
 *
 * @param message - Messaggio ricevuto da `onMessageExternal`.
 * @param senderOrigin - Origine della pagina mittente (`sender.origin`).
 * @param allowedOrigins - Origini ammesse (quelle di `externally_connectable`).
 * @returns Il collegamento da salvare, oppure `null` se il messaggio va rifiutato.
 */
export function acceptConnection(
  message: unknown,
  senderOrigin: string | undefined,
  allowedOrigins: readonly string[],
): Connection | null {
  const parsed = extensionConnectMessageSchema.safeParse(message);
  if (!parsed.success || !senderOrigin) return null;
  const origin = new URL(parsed.data.apiBaseUrl).origin;
  if (origin !== senderOrigin || !allowedOrigins.includes(origin)) return null;
  if (new Date(parsed.data.expiresAt).getTime() <= Date.now()) return null;
  return { token: parsed.data.token, expiresAt: parsed.data.expiresAt, apiBaseUrl: origin };
}

/**
 * Dice se un collegamento salvato è ancora utilizzabile.
 *
 * @param connection - Collegamento letto dallo storage (può mancare o essere corrotto).
 * @returns Il collegamento valido, oppure `null`.
 */
export function usableConnection(connection: unknown): Connection | null {
  const parsed = extensionConnectMessageSchema.omit({ type: true }).safeParse(connection);
  if (!parsed.success) return null;
  return new Date(parsed.data.expiresAt).getTime() > Date.now() ? parsed.data : null;
}
