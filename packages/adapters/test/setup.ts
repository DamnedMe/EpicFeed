import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@study-feed/db';
import { createTestDatabase } from '@study-feed/db/testing';
import type { Database } from '../src/database.js';

export const anna = '0a0a0a0a-0000-4000-8000-00000000000a';
export const bruno = '0b0b0b0b-0000-4000-8000-00000000000b';

/** Postgres in memoria con migrazioni, due utenti e un client Drizzle. */
export async function setup(): Promise<{ pg: PGlite; db: Database }> {
  const pg = await createTestDatabase();
  await pg.exec(`insert into auth.users (id) values ('${anna}'), ('${bruno}')`);
  return { pg, db: drizzle(pg, { schema }) as unknown as Database };
}
