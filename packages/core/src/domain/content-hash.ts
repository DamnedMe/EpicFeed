import type { Brand } from '@epicfeed/shared';
import type { LessonPartContent } from './content.js';
import { canonicalJson, normalizeContent } from './content.js';
import { DomainError } from '@epicfeed/shared';

/** Impronta SHA-256 (64 caratteri esadecimali minuscoli) del contenuto canonico. */
export type ContentHash = Brand<string, 'ContentHash'>;

/**
 * Funzione di digest SHA-256. È iniettata perché il dominio resti senza
 * dipendenze dalla piattaforma; {@link webCryptoSha256} va bene ovunque.
 */
export type Sha256 = (data: Uint8Array<ArrayBuffer>) => Promise<Uint8Array>;

/**
 * SHA-256 con la Web Crypto API, disponibile in modo identico nei browser,
 * in Node (≥ 20), nelle funzioni edge e nei service worker.
 *
 * @param data - Byte da cui calcolare il digest.
 * @returns I 32 byte del digest.
 */
export const webCryptoSha256: Sha256 = async (data) =>
  new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));

/**
 * Calcola l'impronta del contenuto: normalizza, serializza in forma canonica,
 * codifica in UTF-8 e applica SHA-256.
 *
 * Lo stesso materiale dà sempre la stessa impronta, così lo si salva una volta
 * sola anche se lo importano più studenti; una modifica fatta da Epicode dà
 * un'impronta diversa e quindi una nuova versione (ADR 0002).
 *
 * @param content - Contenuto importato (anche non normalizzato).
 * @param sha256 - Implementazione del digest; di default la Web Crypto API.
 * @returns L'impronta esadecimale.
 * @throws {@link DomainError} se il contenuto non è valido.
 */
export async function computeContentHash(
  content: LessonPartContent,
  sha256: Sha256 = webCryptoSha256,
): Promise<ContentHash> {
  return hashCanonical(normalizeContent(content), sha256);
}

/**
 * Impronta di un valore già in forma canonica: JSON con chiavi ordinate,
 * UTF-8, SHA-256, esadecimale minuscolo.
 *
 * @param canonical - Valore normalizzato.
 * @param sha256 - Implementazione del digest.
 * @returns L'impronta esadecimale.
 */
export async function hashCanonical(canonical: unknown, sha256: Sha256): Promise<ContentHash> {
  const bytes = new TextEncoder().encode(canonicalJson(canonical));
  const digest = await sha256(bytes);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('') as ContentHash;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Valida un'impronta ricevuta dall'esterno (database, API).
 *
 * @param value - Stringa da validare.
 * @returns L'impronta marchiata.
 * @throws {@link DomainError} `INVALID_HASH` se non sono 64 caratteri esadecimali minuscoli.
 */
export function parseContentHash(value: string): ContentHash {
  if (!HASH_PATTERN.test(value)) {
    throw new DomainError('INVALID_HASH', 'Impronta del contenuto non valida');
  }
  return value as ContentHash;
}
