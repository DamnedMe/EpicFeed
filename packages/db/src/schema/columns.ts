/**
 * Colonne e vincoli ripetuti nelle tabelle di tutte le funzioni.
 */
import { sql } from 'drizzle-orm';
import { check, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Chiave primaria uuid generata dal database. */
export const id = () => uuid('id').primaryKey().defaultRandom();
/** Momento di creazione della riga. */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
/** Id dell'elemento sul portale Epicode (Directus): serve a riconoscerlo al reimport. */
export const epicodeId = () => text('epicode_id').notNull();
/** Titolo obbligatorio (lunghezza controllata da {@link titleCheck}). */
export const title = () => text('title').notNull();
/** Posizione nell'ordine del portale, da 0. */
export const position = () => integer('position').notNull().default(0);

/** Vincolo: titolo tra 1 e 300 caratteri. */
export const titleCheck = (table: string, column: { name: string }) =>
  check(`${table}_title_check`, sql`char_length(${sql.identifier(column.name)}) between 1 and 300`);
/** Vincolo: posizione maggiore o uguale a 0. */
export const positionCheck = (table: string) =>
  check(`${table}_position_check`, sql`position >= 0`);
/** Vincolo: id Epicode con soli caratteri sicuri, al massimo 64. */
export const epicodeIdCheck = (table: string) =>
  check(`${table}_epicode_id_check`, sql`epicode_id ~ '^[A-Za-z0-9-]{1,64}$'`);
