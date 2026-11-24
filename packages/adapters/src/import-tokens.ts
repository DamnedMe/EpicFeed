import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { apiTokens } from '@epicfeed/db';
import type { Database } from './database.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Durata di un token di import: 30 giorni, poi si ricollega l'estensione. */
export const IMPORT_TOKEN_TTL_MS = 30 * DAY_MS;

/** Durata di un token di generazione del server MCP: 90 giorni (ADR 0013). */
export const GENERATE_TOKEN_TTL_MS = 90 * DAY_MS;

/** Tipo di token personale: ambito nel database, prefisso riconoscibile e durata. */
export interface TokenKind {
  readonly scope: 'import' | 'generate';
  /** Prefisso del token in chiaro (uguale a quello dei contratti). */
  readonly prefix: string;
  readonly ttlMs: number;
}

/** Token dell'estensione (`sfi_`, solo import). */
export const IMPORT_TOKEN_KIND: TokenKind = {
  scope: 'import',
  prefix: 'sfi_',
  ttlMs: IMPORT_TOKEN_TTL_MS,
};

/** Token del server MCP (`sfg_`, solo generazione). */
export const GENERATE_TOKEN_KIND: TokenKind = {
  scope: 'generate',
  prefix: 'sfg_',
  ttlMs: GENERATE_TOKEN_TTL_MS,
};

/** Token appena creato: il valore in chiaro esiste solo qui, mai nel database. */
export interface IssuedToken {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: Date;
}

/** Token appena creato (nome storico, usato dall'estensione). */
export type IssuedImportToken = IssuedToken;

/** Token di un utente, come mostrato nella pagina di gestione (senza segreti). */
export interface TokenSummary {
  readonly id: string;
  readonly label: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date | null;
}

/** Token di un utente (nome storico, usato dall'estensione). */
export type ImportTokenSummary = TokenSummary;

/**
 * Token personali per i client che non hanno la sessione della web app:
 * l'estensione (`POST /api/import`) e il server MCP di Claude Desktop (API di
 * generazione). Ogni istanza gestisce un solo tipo di token.
 *
 * - 32 byte casuali (256 bit) in base64url, con un prefisso riconoscibile dal
 *   secret scanning (`sfi_` import, `sfg_` generazione);
 * - nel database va solo lo SHA-256 del token: chi legge la tabella non può
 *   usarlo (con 256 bit casuali non serve un hash lento come per le password);
 * - un ambito solo, una scadenza (30 o 90 giorni), revocabile in qualsiasi
 *   momento. Un token di import non vale per la generazione e viceversa.
 */
export class PersonalTokenService {
  private readonly pattern: RegExp;

  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   * @param kind - Tipo di token gestito.
   * @param now - Sorgente del tempo, iniettabile nei test.
   */
  constructor(
    private readonly db: Database,
    private readonly kind: TokenKind,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.pattern = new RegExp(`^${kind.prefix}[A-Za-z0-9_-]{43}$`);
  }

  /**
   * Crea un nuovo token per l'utente.
   *
   * @param userId - Utente autenticato nella web app.
   * @param label - Nome mostrato nella gestione dei token (es. "Chrome sul PC").
   * @returns Il token in chiaro (da consegnare una volta sola) e la scadenza.
   */
  async issue(userId: string, label = 'Estensione'): Promise<IssuedToken> {
    const token = this.kind.prefix + randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.kind.ttlMs);
    const [row] = await this.db
      .insert(apiTokens)
      .values({
        userId,
        scope: this.kind.scope,
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
    if (!this.pattern.test(token)) return null;
    const hash = hashToken(token);
    const now = this.now();
    const [row] = await this.db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiTokens.tokenHash, hash),
          eq(apiTokens.scope, this.kind.scope),
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
   * Elenca i token attivi dell'utente di questo tipo (per la pagina di gestione).
   *
   * @param userId - Utente autenticato.
   * @returns I token non revocati e non scaduti, dal più recente.
   */
  async listActive(userId: string): Promise<TokenSummary[]> {
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
          eq(apiTokens.scope, this.kind.scope),
          isNull(apiTokens.revokedAt),
          gt(apiTokens.expiresAt, this.now()),
        ),
      )
      .orderBy(sql`${apiTokens.createdAt} desc`);
  }

  /**
   * Revoca un token dell'utente. Un token di un altro utente o di un altro
   * tipo non viene toccato.
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
        and(
          eq(apiTokens.id, tokenId),
          eq(apiTokens.userId, userId),
          eq(apiTokens.scope, this.kind.scope),
          isNull(apiTokens.revokedAt),
        ),
      )
      .returning({ id: apiTokens.id });
    return rows.length > 0;
  }
}

/** Token dell'estensione: ambito `import`, 30 giorni. */
export class ImportTokenService extends PersonalTokenService {
  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   * @param now - Sorgente del tempo, iniettabile nei test.
   */
  constructor(db: Database, now?: () => Date) {
    super(db, IMPORT_TOKEN_KIND, now);
  }
}

/** Token del server MCP: ambito `generate`, 90 giorni (ADR 0013). */
export class GenerateTokenService extends PersonalTokenService {
  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   * @param now - Sorgente del tempo, iniettabile nei test.
   */
  constructor(db: Database, now?: () => Date) {
    super(db, GENERATE_TOKEN_KIND, now);
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
