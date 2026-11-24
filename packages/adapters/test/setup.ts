import type { PGlite } from '@electric-sql/pglite';
import type { Database } from '@epicfeed/db';
import { setupTestDatabase, TEST_USERS } from '@epicfeed/db/testing';

export const anna = TEST_USERS.anna;
export const bruno = TEST_USERS.bruno;

/** Postgres in memoria con migrazioni, due utenti e un client Drizzle. */
export async function setup(): Promise<{ pg: PGlite; db: Database }> {
  return setupTestDatabase();
}
