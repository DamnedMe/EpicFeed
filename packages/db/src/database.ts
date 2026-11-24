import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type * as schema from './schema/index.js';

/**
 * Database Drizzle usato dagli adapter. È il tipo comune ai driver: in
 * produzione `postgres-js` verso Supabase, nei test PGlite in memoria.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Transazione Drizzle sullo stesso schema. */
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Esegue `work` con i permessi di uno studente: ruolo `authenticated` e
 * `auth.uid()` uguale a `userId`, dentro una transazione. Così anche le letture
 * fatte dal server passano dalla RLS, come se arrivassero dal client: un errore
 * nella query non può mostrare dati di altri studenti.
 *
 * @param db - Database.
 * @param userId - Id dello studente (già verificato dall'autenticazione).
 * @param work - Letture da eseguire.
 * @returns Il valore restituito da `work`.
 */
export async function withUserRls<T>(
  db: Database,
  userId: string,
  work: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // `true` = valido solo per questa transazione. Supabase legge l'utente da
    // `request.jwt.claims` (e, nelle versioni vecchie, da `request.jwt.claim.sub`).
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true),
      set_config('request.jwt.claim.sub', ${userId}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return work(tx);
  });
}
