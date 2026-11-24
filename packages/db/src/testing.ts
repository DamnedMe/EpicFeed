/**
 * Strumenti di test condivisi (`@epicfeed/db/testing`): un Postgres in
 * memoria (PGlite) con lo strato Supabase simulato e tutte le migrazioni.
 * Li usano i test di `db` (RLS) e dei repository Drizzle nelle cartelle `infrastructure` dei pacchetti di funzione.
 * Richiedono `@electric-sql/pglite` tra le dipendenze di sviluppo.
 *
 * @packageDocumentation
 */
import { readFileSync } from 'node:fs';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Database } from './database.js';
import * as schema from './schema.js';

// Valgono sia da `src/` (test) sia da `dist/` (pacchetto compilato).
const migrationsDir = new URL('../migrations/', import.meta.url);
const shimFile = new URL('../testing/supabase-shim.sql', import.meta.url);

interface Journal {
  entries: { tag: string }[];
}

/**
 * Crea un Postgres in memoria (PGlite) con lo "strato Supabase" simulato e
 * tutte le migrazioni applicate nell'ordine del journal di drizzle-kit.
 */
export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(shimFile, 'utf8'));
  const journal = JSON.parse(
    readFileSync(new URL('meta/_journal.json', migrationsDir), 'utf8'),
  ) as Journal;
  for (const { tag } of journal.entries) {
    const sql = readFileSync(new URL(`${tag}.sql`, migrationsDir), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await db.exec(statement);
    }
  }
  return db;
}

/**
 * Esegue `fn` in una transazione che viene sempre annullata, così ogni test
 * parte dagli stessi dati. Gli errori di `fn` (anche le asserzioni) risalgono.
 */
export async function inRollback<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T | undefined;
  const rolledBack = new Error('rollback del test');
  await db
    .transaction(async (tx) => {
      result = await fn(tx);
      throw rolledBack;
    })
    .catch((error: unknown) => {
      if (error !== rolledBack) throw error;
    });
  return result as T;
}

/**
 * Esegue `fn` come farebbe una richiesta di uno studente: ruolo
 * `authenticated` e `auth.uid()` uguale a `userId` (oppure `anon` se
 * `userId` è `null`), dentro una transazione annullata alla fine.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (query: <R>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  return inRollback(db, async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await tx.exec(`set local role ${userId === null ? 'anon' : 'authenticated'}`);
    return fn(async <R>(sql: string, params?: unknown[]) => (await tx.query<R>(sql, params)).rows);
  });
}

/** Id di due studenti di prova, già presenti in `auth.users` con {@link setupTestDatabase}. */
export const TEST_USERS = {
  anna: '0a0a0a0a-0000-4000-8000-00000000000a',
  bruno: '0b0b0b0b-0000-4000-8000-00000000000b',
} as const;

/**
 * Postgres in memoria con migrazioni, i due studenti di {@link TEST_USERS} e un
 * client Drizzle: la base dei test dei repository di ogni pacchetto di funzione.
 */
export async function setupTestDatabase(): Promise<{ pg: PGlite; db: Database }> {
  const pg = await createTestDatabase();
  await pg.exec(
    `insert into auth.users (id) values ('${TEST_USERS.anna}'), ('${TEST_USERS.bruno}')`,
  );
  return { pg, db: drizzle(pg, { schema }) as unknown as Database };
}
