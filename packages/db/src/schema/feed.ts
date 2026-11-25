/**
 * Generazione (M2, ADR 0013): feed per lezione e glossario per materia.
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
import { id, createdAt } from './columns.js';
import { subjects, lessons } from './catalog.js';

/**
 * Feed di una lezione (schede, quiz, concetti in italiano e inglese), generato
 * da Claude Desktop tramite il server MCP. Una riga per lezione e per impronta
 * delle fonti (`computeLessonSourcesHash` di `@epicfeed/feed`): il primo feed per un
 * insieme di versioni vale per tutti quelli che le possiedono (ADR 0007).
 * `feed` è il documento validato con `storedLessonFeedSchema`.
 */
export const lessonFeeds = pgTable(
  'lesson_feeds',
  {
    id: id(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    sourcesHash: text('sources_hash').notNull(),
    promptVersion: text('prompt_version').notNull(),
    feed: jsonb('feed').notNull(),
    /**
     * Versioni da cui è nato il feed. Stanno nella riga stessa (non in una
     * tabella collegata) perché la policy deve vederle tutte: una tabella con
     * la sua RLS mostrerebbe alla policy solo quelle dello studente.
     */
    sourceVersionIds: uuid('source_version_ids').array().notNull(),
    /** Chi ha generato il feed (null se l'account è stato cancellato). */
    generatedBy: uuid('generated_by').references(() => authUsers.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lesson_feeds_lesson_sources_key').on(t.lessonId, t.sourcesHash),
    check('lesson_feeds_hash_check', sql`sources_hash ~ '^[0-9a-f]{64}$'`),
    check(
      'lesson_feeds_prompt_version_check',
      sql`prompt_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]{1,3}$'`,
    ),
    // Un feed reale pesa 30–60 KB: 1 MB ferma qualsiasi abuso.
    check('lesson_feeds_size_check', sql`pg_column_size(feed) <= 1048576`),
    check('lesson_feeds_sources_check', sql`cardinality(source_version_ids) between 1 and 40`),
    index('lesson_feeds_generated_by_idx').on(t.generatedBy),
    // Visibile solo a chi possiede TUTTE le versioni da cui è nato: niente
    // schede di parti che lo studente non ha importato.
    pgPolicy('lesson_feeds_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`not exists (
        select 1 from unnest(${t.sourceVersionIds}) as v(id)
        where not exists (
          select 1 from entitlements en
          where en.content_version_id = v.id and en.user_id = ${authUid}
        )
      )`,
    }),
  ],
).enableRLS();

/**
 * Glossario bilingue di una materia (ADR 0006, ADR 0011): il termine come lo
 * usa il corso (inglese), la traduzione italiana e una breve definizione.
 * Cresce lezione dopo lezione; a parità di termine resta la prima voce.
 */
export const glossaryTerms = pgTable(
  'glossary_terms',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    /** Termine normalizzato (`glossaryKey` di `@epicfeed/feed`): minuscolo, spazi compattati. */
    termKey: text('term_key').notNull(),
    translation: text('translation').notNull(),
    /** Definizione `{ it, en }`. */
    definition: jsonb('definition').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('glossary_terms_subject_term_key').on(t.subjectId, t.termKey),
    check('glossary_terms_term_check', sql`char_length(term) between 1 and 80`),
    check('glossary_terms_translation_check', sql`char_length(translation) between 1 and 120`),
    check('glossary_terms_size_check', sql`pg_column_size(definition) <= 4096`),
    // Visibile a chi vede la materia (che a sua volta dipende dai permessi).
    pgPolicy('glossary_terms_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (select 1 from subjects s where s.id = ${t.subjectId})`,
    }),
  ],
).enableRLS();

/**
 * Correzioni personali alle schede e alle domande (M5, ADR 0006 punto 3 e
 * ADR 0020): area privata dello studente. Non cambiano il feed condiviso;
 * la web app le scarica e le applica sul dispositivo. L'id lo sceglie l'app,
 * così una correzione fatta offline si reinvia senza doppioni. Lo studente le
 * vede solo con la RLS; scrive solo l'API sul server.
 */
export const feedCorrections = pgTable(
  'feed_corrections',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    /** Lezione corretta; `null` per un termine, che vale in tutta la materia. */
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** Correzione dello studente, validata con `correctionDraftSchema` di `@epicfeed/feed`. */
    correction: jsonb('correction').notNull(),
    claudeStatus: text('claude_status').notNull(),
    /** Esito del lavoro di Claude (`correctionCompletionSchema`), `null` finché non arriva. */
    completion: jsonb('completion'),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    check('feed_corrections_kind_check', sql`kind in ('text', 'regenerate', 'answer', 'term')`),
    check(
      'feed_corrections_claude_status_check',
      sql`claude_status in ('pending', 'done', 'disputed', 'not_needed')`,
    ),
    check('feed_corrections_lesson_check', sql`(kind = 'term') = (lesson_id is null)`),
    check('feed_corrections_size_check', sql`pg_column_size(correction) <= 65536`),
    check(
      'feed_corrections_completion_size_check',
      sql`completion is null or pg_column_size(completion) <= 65536`,
    ),
    index('feed_corrections_user_idx').on(t.userId, t.createdAt),
    index('feed_corrections_subject_idx').on(t.subjectId),
    index('feed_corrections_lesson_idx').on(t.lessonId),
    pgPolicy('feed_corrections_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();
