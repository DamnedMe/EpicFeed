/**
 * Progressi di studio sincronizzati (M4, ADR 0018), cifrati sul dispositivo.
 */
import { sql } from 'drizzle-orm';
import { check, integer, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUid, authUsers, authenticatedRole } from 'drizzle-orm/supabase';

/**
 * Copia **cifrata sul dispositivo** dei progressi di uno studente (risposte e
 * giorni di ripasso), una riga per utente. Il server conserva solo dati che
 * non può leggere: la chiave nasce dalla password nel browser e non esce mai
 * dal dispositivo. Testo base64 invece di `bytea` per restare semplice con
 * PostgREST e Drizzle; le dimensioni sono limitate dai `check`.
 *
 * - `revision` cresce a ogni scrittura: l'API scrive solo se il dispositivo
 *   parte dall'ultima versione (concorrenza ottimistica tra telefono e PC).
 * - `kdf` descrive come si ricava la chiave, per poterla cambiare in futuro.
 * - `salt` (16 byte) e `iv` (12 byte) cambiano a ogni scrittura.
 *
 * Lettura solo propria con RLS; scrive solo l'API sul server.
 */
export const progressSnapshots = pgTable(
  'progress_snapshots',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    kdf: text('kdf').notNull(),
    salt: text('salt').notNull(),
    iv: text('iv').notNull(),
    ciphertext: text('ciphertext').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('progress_snapshots_revision_check', sql`${t.revision} >= 1`),
    check('progress_snapshots_kdf_check', sql`${t.kdf} ~ '^[a-z0-9-]{1,40}$'`),
    check('progress_snapshots_salt_check', sql`${t.salt} ~ '^[A-Za-z0-9+/]{22}==$'`),
    check('progress_snapshots_iv_check', sql`${t.iv} ~ '^[A-Za-z0-9+/]{16}$'`),
    check(
      'progress_snapshots_ciphertext_check',
      sql`char_length(${t.ciphertext}) between 24 and 4000000 and ${t.ciphertext} ~ '^[A-Za-z0-9+/]+={0,2}$'`,
    ),
    pgPolicy('progress_snapshots_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();
