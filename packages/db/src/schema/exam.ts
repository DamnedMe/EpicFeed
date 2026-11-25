/**
 * Preparazione all'esame (M4, ADR 0014 e ADR 0017): pacchetti d'esame,
 * banche degli esercizi e risposte inviate a Claude per la correzione.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUid, authUsers, authenticatedRole } from 'drizzle-orm/supabase';
import { id } from './columns.js';
import { subjects } from './catalog.js';
import { lessonFeeds } from './feed.js';

/**
 * Pacchetto d'esame di un feed (M4, ADR 0014 e ADR 0017): domande a scelta
 * multipla in più per il quiz di modulo e domande aperte con soluzione
 * modello e griglia, in inglese. Uno per feed: se il feed della lezione si
 * rigenera, il pacchetto si rigenera con lui (i concetti potrebbero cambiare).
 */
export const lessonExamPacks = pgTable(
  'lesson_exam_packs',
  {
    id: id(),
    lessonFeedId: uuid('lesson_feed_id')
      .notNull()
      .references(() => lessonFeeds.id, { onDelete: 'cascade' }),
    promptVersion: text('prompt_version').notNull(),
    pack: jsonb('pack').notNull(),
    /** Chi ha generato il pacchetto (null se l'account è stato cancellato). */
    generatedBy: uuid('generated_by').references(() => authUsers.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lesson_exam_packs_feed_key').on(t.lessonFeedId),
    check(
      'lesson_exam_packs_prompt_version_check',
      sql`prompt_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]{1,3}$'`,
    ),
    // Un pacchetto reale pesa 15–30 KB: 512 KB ferma qualsiasi abuso.
    check('lesson_exam_packs_size_check', sql`pg_column_size(pack) <= 524288`),
    index('lesson_exam_packs_generated_by_idx').on(t.generatedBy),
    // Visibile a chi vede il feed (che a sua volta richiede tutte le fonti).
    pgPolicy('lesson_exam_packs_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (select 1 from lesson_feeds lf where lf.id = ${t.lessonFeedId})`,
    }),
  ],
).enableRLS();

/**
 * Banca degli esercizi d'esame di una materia (M4, ADR 0014 §2): esercizi
 * ufficiali trascritti dal materiale d'esame del corso e due varianti per
 * ciascuno, in inglese. **Privata** di chi l'ha generata: il materiale d'esame
 * resta sul suo PC e non c'è una prova di possesso da condividere.
 */
export const subjectExamBanks = pgTable(
  'subject_exam_banks',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    generatedBy: uuid('generated_by')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    promptVersion: text('prompt_version').notNull(),
    bank: jsonb('bank').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('subject_exam_banks_subject_user_key').on(t.subjectId, t.generatedBy),
    check(
      'subject_exam_banks_prompt_version_check',
      sql`prompt_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]{1,3}$'`,
    ),
    // 42 esercizi pesano circa 150 KB: 1 MB ferma qualsiasi abuso.
    check('subject_exam_banks_size_check', sql`pg_column_size(bank) <= 1048576`),
    index('subject_exam_banks_generated_by_idx').on(t.generatedBy),
    // Solo la propria banca, e solo per una materia che si vede ancora.
    pgPolicy('subject_exam_banks_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.generatedBy} = ${authUid} and exists (select 1 from subjects s where s.id = ${t.subjectId})`,
    }),
  ],
).enableRLS();

/**
 * Risposte inviate a Claude per la correzione (M4, ADR 0014 punto confermato
 * 1): l'unica eccezione all'ADR 0003 per lo studio. Ci sono solo le risposte
 * mandate con *Fai correggere a Claude*; l'app scarica la correzione e cancella
 * la riga, e quelle mai scaricate scadono dopo 30 giorni. Lo studente le vede
 * solo con la RLS; scrive solo l'API sul server.
 */
export const examSubmissions = pgTable(
  'exam_submissions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** Domande, risposte e griglie inviate (validate con i contratti). */
    submission: jsonb('submission').notNull(),
    /** Correzione di Claude, `null` finché non arriva. */
    correction: jsonb('correction'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    correctedAt: timestamp('corrected_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
  },
  (t) => [
    check('exam_submissions_kind_check', sql`kind in ('exercise', 'interview')`),
    check('exam_submissions_size_check', sql`pg_column_size(submission) <= 131072`),
    check(
      'exam_submissions_correction_size_check',
      sql`correction is null or pg_column_size(correction) <= 131072`,
    ),
    index('exam_submissions_user_idx').on(t.userId, t.createdAt),
    pgPolicy('exam_submissions_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();
