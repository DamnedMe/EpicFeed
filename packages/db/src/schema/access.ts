/**
 * Accesso delle app esterne (estensione, server MCP) e limiti di frequenza:
 * token personali e registri delle chiamate, senza contenuti.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUid, authUsers, authenticatedRole } from 'drizzle-orm/supabase';
import { id, createdAt } from './columns.js';
import { lessons } from './catalog.js';

/**
 * Ambito di un token personale: `import` per l'estensione (M1), `generate`
 * per il server MCP di Claude Desktop (M2, ADR 0013).
 */
export const apiTokenScope = pgEnum('api_token_scope', ['import', 'generate']);

/** Azione registrata per il limite di frequenza della generazione. */
export const generationAction = pgEnum('generation_action', ['read', 'save', 'slides']);

/**
 * Token personali per i client che non hanno la sessione della web app
 * (estensione, in M2 il server MCP). Nel database c'è solo l'impronta SHA-256
 * del token: chi legge la tabella non può ricostruirlo. Ogni token ha un
 * ambito, una scadenza e si può revocare.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    scope: apiTokenScope('scope').notNull(),
    tokenHash: text('token_hash').notNull(),
    label: text('label').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    unique('api_tokens_token_hash_key').on(t.tokenHash),
    check('api_tokens_hash_check', sql`token_hash ~ '^[0-9a-f]{64}$'`),
    check('api_tokens_label_check', sql`char_length(label) between 1 and 100`),
    check('api_tokens_expiry_check', sql`expires_at > created_at`),
    index('api_tokens_user_idx').on(t.userId),
    // Lo studente vede l'elenco dei propri token (per revocarli dalla web app).
    pgPolicy('api_tokens_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

/**
 * Registro degli import: serve al limite di frequenza dell'API e mostra allo
 * studente la cronologia dei propri import. Non contiene contenuti.
 */
export const importEvents = pgTable(
  'import_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    partCount: integer('part_count').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('import_events_part_count_check', sql`part_count >= 0`),
    // Il limite di frequenza conta gli import recenti di un utente.
    index('import_events_user_created_idx').on(t.userId, t.createdAt),
    index('import_events_lesson_idx').on(t.lessonId),
    pgPolicy('import_events_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

/**
 * Registro delle chiamate del server MCP (lettura delle fonti, salvataggio):
 * serve al limite di frequenza (120 all'ora, ADR 0013). Non contiene contenuti.
 */
export const generationEvents = pgTable(
  'generation_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    action: generationAction('action').notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('generation_events_user_created_idx').on(t.userId, t.createdAt),
    index('generation_events_lesson_idx').on(t.lessonId),
    pgPolicy('generation_events_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();
