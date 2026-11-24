import type { EncryptedProgress } from '@study-feed/contracts';
import { PROGRESS_KDF } from '@study-feed/contracts';
import type { ProgressSnapshot } from '@study-feed/core';
import { PROGRESS_SNAPSHOT_VERSION } from '@study-feed/core';
import * as z from 'zod';
import { answerSchema } from '../review/progress-store';

/**
 * Cifratura dei progressi nel browser (M4, ADR 0018), solo con WebCrypto.
 *
 * 1. **Chiave della password**: PBKDF2-SHA256 con 600.000 iterazioni (OWASP)
 *    sulla password, con un sale ricavato dall'email. Si calcola una volta,
 *    all'accesso o allo sblocco, e si conserva come chiave HKDF **non
 *    estraibile**: il browser la usa ma nessuno script la può leggere.
 * 2. **Chiave di ogni scrittura**: HKDF con 16 byte casuali (`salt`, nuovi a
 *    ogni scrittura) → AES-GCM a 256 bit, con 12 byte casuali di `iv`.
 * 3. Il testo cifrato contiene la copia in JSON, compressa con gzip quando il
 *    browser lo permette; i dati associati legano il testo al metodo `kdf`.
 *
 * Il server riceve solo `salt`, `iv` e testo cifrato: senza la password non
 * può ricavare la chiave.
 */

const PBKDF2_ITERATIONS = 600_000;
const encoder = new TextEncoder();
const HKDF_INFO = encoder.encode('epicfeed/progress/aes-gcm/v1');
const AAD = encoder.encode(`epicfeed/progress/v1/${PROGRESS_KDF}`);

/** Primo byte del testo in chiaro: come è codificata la copia. */
const PLAIN_JSON = 0;
const GZIP_JSON = 1;

const snapshotSchema: z.ZodType<ProgressSnapshot> = z.object({
  version: z.literal(PROGRESS_SNAPSHOT_VERSION),
  answers: z.array(answerSchema),
  reviewDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  bestStreak: z.number().int().min(0),
});

/** Byte in base64 (standard, con `=`). */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** Base64 in byte. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Normalizza l'email come la usa il sale (stessa chiave su ogni dispositivo). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Ricava la chiave della password (passo lento, ~0,3–1 s su un telefono).
 *
 * @param email - Email dell'account (fa da sale).
 * @param password - Password.
 * @returns Chiave HKDF non estraibile, da conservare in IndexedDB.
 */
export async function derivePasswordKey(email: string, password: string): Promise<CryptoKey> {
  const salt = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`epicfeed/progress-key/v1/${normalizeEmail(email)}`),
  );
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    256,
  );
  return crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
}

/** Chiave AES-GCM di una scrittura. */
function aesKey(passwordKey: CryptoKey, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: HKDF_INFO },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Passa i byte da uno stream di compressione o decompressione. */
async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/**
 * Cifra la copia dei progressi.
 *
 * @param passwordKey - Chiave della password.
 * @param snapshot - Progressi.
 * @returns I campi cifrati da mandare al server.
 */
export async function encryptSnapshot(
  passwordKey: CryptoKey,
  snapshot: ProgressSnapshot,
): Promise<EncryptedProgress> {
  const json = encoder.encode(JSON.stringify(snapshot));
  const gzip = typeof CompressionStream === 'function';
  const body = gzip ? await pipe(json, new CompressionStream('gzip')) : json;
  const plain = new Uint8Array(body.length + 1);
  plain[0] = gzip ? GZIP_JSON : PLAIN_JSON;
  plain.set(body, 1);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    await aesKey(passwordKey, salt),
    plain,
  );
  return {
    kdf: PROGRESS_KDF,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(cipher)),
  };
}

/**
 * Decifra la copia dei progressi.
 *
 * @param passwordKey - Chiave della password.
 * @param encrypted - Campi arrivati dal server.
 * @returns I progressi, oppure `null` se la chiave non è quella giusta (password
 *   cambiata) o il contenuto non è valido.
 */
export async function decryptSnapshot(
  passwordKey: CryptoKey,
  encrypted: EncryptedProgress,
): Promise<ProgressSnapshot | null> {
  if (encrypted.kdf !== PROGRESS_KDF) return null;
  let plain: Uint8Array<ArrayBuffer>;
  try {
    const buffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(encrypted.iv), additionalData: AAD },
      await aesKey(passwordKey, fromBase64(encrypted.salt)),
      fromBase64(encrypted.ciphertext),
    );
    plain = new Uint8Array(buffer);
  } catch {
    // AES-GCM verifica l'integrità: chiave sbagliata o testo alterato.
    return null;
  }
  try {
    const body = plain.subarray(1);
    const json =
      plain[0] === GZIP_JSON ? await pipe(body.slice(), new DecompressionStream('gzip')) : body;
    const parsed = snapshotSchema.safeParse(JSON.parse(new TextDecoder().decode(json)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
