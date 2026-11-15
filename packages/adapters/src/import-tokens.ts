import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { apiTokens } from '@study-feed/db';
import type { Database } from './database.js';

/** Prefisso dei token di import (uguale a `IMPORT_TOKEN_PREFIX` dei contratti). */
const PREFIX = 'sfi_';
const TOKEN_PATTERN = /^sfi_[A-Za-z0-9_-]{43}$/;

/** Durata di un token di import: 30 giorni, poi si ricollega l'estensione. */
export const IMPORT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Token appena creato: il valore in chiaro esiste solo qui, mai nel database. */
export interface IssuedImportToken {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: Date;
}

/** Token di un utente, come mostrato nella pagina di gestione (senza segreti). */
export interface ImportTokenSummary {
  readonly id: string;
  readonly label: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date | null;
}

/**
 * Token personali con cui l'estensione chiama `POST /api/import` senza avere
 * la sessione della web app.
 *
 * - 32 byte casuali (256 bit) in base64url, con prefisso `sfi_` riconoscibile
 *   dal secret scanning;
 * - nel database va solo lo SHA-256 del token: chi legge la tabella non può
 *   usarlo (con 256 bit casuali non serve un hash lento come per le password);
 * - ambito `import`, scadenza a 30 giorni, revocabile in qualsiasi momento.
 */
export class ImportTokenService {
  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   * @param now - Sorgente del tempo, iniettabile nei test.
   */
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Crea un nuovo token di import per l'utente.
   *
   * @param userId - Utente autenticato nella web app.
   * @param label - Nome mostrato nella gestione dei token (es. "Chrome sul PC").
   * @returns Il token in chiaro (da consegnare una volta sola all'estensione) e la scadenza.
   */
  async issue(userId: string, label = 'Estensione'): Promise<IssuedImportToken> {
    const token = PREFIX + randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + IMPORT_TOKEN_TTL_MS);
    const [row] = await this.db
      .insert(apiTokens)
      .values({
        userId,
        scope: 'import',
        tokenHash: hashToken(token),
        label: label.slice(0, 100),
        createdAt,
        expiresAt,
      })
      .returning({ id: apiTokens.id });
    if (!row) throw new Error('Token non salvato');
    return { id: row.id, token, expiresAt };
  }

  /**
   * Verifica un token presentato all'API.
   *
   * @param token - Valore dell'header `Authorization: Bearer …`.
   * @returns L'id dell'utente, oppure `null` se il token è malformato,
   *   sconosciuto, scaduto o revocato (senza dire quale dei casi, di proposito).
   */
  async verify(token: string): Promise<string | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const hash = hashToken(token);
    const now = this.now();
    const [row] = await this.db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiTokens.tokenHash, hash),
          eq(apiTokens.scope, 'import'),
          isNull(apiTokens.revokedAt),
          gt(apiTokens.expiresAt, now),
        ),
      )
      .returning({ userId: apiTokens.userId, tokenHash: apiTokens.tokenHash });
    // Il confronto vero lo fa l'indice univoco; questo controllo a tempo
    // costante è una cintura in più contro sorprese del driver.
    if (!row || !timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash))) return null;
    return row.userId;
  }

  /**
   * Elenca i token attivi dell'utente (per la pagina di gestione).
   *
   * @param userId - Utente autenticato.
   * @returns I token non revocati e non scaduti, dal più recente.
   */
  async listActive(userId: string): Promise<ImportTokenSummary[]> {
    return this.db
      .select({
        id: apiTokens.id,
        label: apiTokens.label,
        createdAt: apiTokens.createdAt,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .where(
        and(
          eq(apiTokens.userId, userId),
          isNull(apiTokens.revokedAt),
          gt(apiTokens.expiresAt, this.now()),
        ),
      )
      .orderBy(sql`${apiTokens.createdAt} desc`);
  }

  /**
   * Revoca un token dell'utente. Un token di un altro utente non viene toccato.
   *
   * @param userId - Utente autenticato.
   * @param tokenId - Id del token da revocare.
   * @returns `true` se il token è stato revocato.
   */
  async revoke(userId: string, tokenId: string): Promise<boolean> {
    const rows = await this.db
      .update(apiTokens)
      .set({ revokedAt: this.now() })
      .where(
        and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)),
      )
      .returning({ id: apiTokens.id });
    return rows.length > 0;
  }
}

/**
 * SHA-256 esadecimale di un token.
 *
 * @param token - Token in chiaro.
 * @returns L'impronta salvata nel database.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
