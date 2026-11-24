import { and, count, eq, gt } from 'drizzle-orm';
import { generationEvents, importEvents } from '@epicfeed/db';
import type { Database } from './database.js';

/** Regola del limite: al massimo `limit` import ogni `windowMs` millisecondi. */
export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Limite predefinito: 60 import all'ora. Un uso normale (una lezione ogni
 * pochi minuti) resta molto sotto; un client impazzito si ferma subito.
 */
export const DEFAULT_IMPORT_RATE_LIMIT: RateLimitRule = { limit: 60, windowMs: 60 * 60 * 1000 };

/**
 * Limite di frequenza degli import basato sul registro `import_events`.
 * Non serve un servizio esterno (Redis): con un utente e poche richieste
 * all'ora una query su un indice (utente, data) costa meno di un millisecondo.
 */
export class ImportRateLimiter {
  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   * @param rule - Limite da applicare.
   * @param now - Sorgente del tempo, iniettabile nei test.
   */
  constructor(
    private readonly db: Database,
    private readonly rule: RateLimitRule = DEFAULT_IMPORT_RATE_LIMIT,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Dice se l'utente può fare un altro import adesso.
   *
   * @param userId - Utente autenticato.
   * @returns `true` se è sotto il limite.
   */
  async isAllowed(userId: string): Promise<boolean> {
    const since = new Date(this.now().getTime() - this.rule.windowMs);
    const [row] = await this.db
      .select({ n: count() })
      .from(importEvents)
      .where(and(eq(importEvents.userId, userId), gt(importEvents.createdAt, since)));
    return (row?.n ?? 0) < this.rule.limit;
  }

  /**
   * Registra un import riuscito.
   *
   * @param userId - Utente autenticato.
   * @param lessonId - Lezione importata (`null` se non applicabile).
   * @param partCount - Numero di parti importate.
   */
  async record(userId: string, lessonId: string | null, partCount: number): Promise<void> {
    await this.db
      .insert(importEvents)
      .values({ userId, lessonId, partCount, createdAt: this.now() });
  }
}

/**
 * Limite predefinito della generazione: 120 chiamate all'ora (ADR 0013). Una
 * lezione costa due chiamate (lettura e salvataggio), più qualche nuovo
 * tentativo se il feed va corretto: un corso intero resta sotto il limite.
 */
export const DEFAULT_GENERATION_RATE_LIMIT: RateLimitRule = {
  limit: 120,
  windowMs: 60 * 60 * 1000,
};

/** Azione registrata dal limite della generazione. */
export type GenerationAction = 'read' | 'save' | 'slides';

/**
 * Limite di frequenza delle chiamate del server MCP, sul registro
 * `generation_events` (stessa logica di {@link ImportRateLimiter}).
 */
export class GenerationRateLimiter {
  /**
   * @param db - Database con permessi di scrittura (solo lato server).
   * @param rule - Limite da applicare.
   * @param now - Sorgente del tempo, iniettabile nei test.
   */
  constructor(
    private readonly db: Database,
    private readonly rule: RateLimitRule = DEFAULT_GENERATION_RATE_LIMIT,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Dice se l'utente può fare un'altra chiamata adesso.
   *
   * @param userId - Utente autenticato.
   * @returns `true` se è sotto il limite.
   */
  async isAllowed(userId: string): Promise<boolean> {
    const since = new Date(this.now().getTime() - this.rule.windowMs);
    const [row] = await this.db
      .select({ n: count() })
      .from(generationEvents)
      .where(and(eq(generationEvents.userId, userId), gt(generationEvents.createdAt, since)));
    return (row?.n ?? 0) < this.rule.limit;
  }

  /**
   * Registra una chiamata.
   *
   * @param userId - Utente autenticato.
   * @param action - Lettura delle fonti, salvataggio del feed o import di slide.
   * @param lessonId - Lezione interessata (`null` per l'elenco).
   */
  async record(userId: string, action: GenerationAction, lessonId: string | null): Promise<void> {
    await this.db
      .insert(generationEvents)
      .values({ userId, action, lessonId, createdAt: this.now() });
  }
}
