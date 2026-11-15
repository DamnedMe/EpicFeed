/**
 * Schema Postgres di Study Feed (Supabase, regione UE).
 *
 * Catalogo condiviso e deduplicato (ADR 0002):
 *   study_programs > editions > subjects > chapters > lessons > lesson_parts > content_versions
 * più `entitlements`, i permessi degli studenti sulle singole versioni.
 *
 * Sicurezza (architettura §8):
 * - RLS attiva su ogni tabella fin dal primo giorno;
 * - gli studenti (`authenticated`) possono solo **leggere**, e solo ciò che
 *   hanno importato dal proprio account; nessuna policy di scrittura, quindi
 *   insert/update/delete dal client sono sempre negati;
 * - le scritture le fa solo l'API sul server (import, generazione), dopo aver
 *   validato i dati e verificato la prova di possesso;
 * - `anon` (utente non autenticato) non vede nulla.
 *
 * Le policy dei livelli alti del catalogo interrogano il livello inferiore,
 * che ha a sua volta la sua RLS: così ogni regola guarda un solo passo e la
 * visibilità risale da `entitlements` fino al corso di studi.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { authUid, authUsers, authenticatedRole } from 'drizzle-orm/supabase';

// ---------------------------------------------------------------------------
// Tipi enumerati (allineati ai tipi del dominio in @study-feed/core)
// ---------------------------------------------------------------------------

/** Tipo di parte di lezione: video (riassunti + sottotitoli) o testo da leggere. */
export const lessonPartKind = pgEnum('lesson_part_kind', ['video', 'reading']);

/** Stato di generazione di schede e quiz di una versione (ADR 0007). */
export const generationStatus = pgEnum('generation_status', [
  'pending',
  'generating',
  'ready',
  'failed',
]);

/** Base del permesso: oggi solo la prova di possesso (ADR 0002, fase 1). */
export const entitlementBasis = pgEnum('entitlement_basis', ['possession_proof']);

// ---------------------------------------------------------------------------
// Colonne comuni
// ---------------------------------------------------------------------------

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
/** Id dell'elemento sul portale Epicode (Directus): serve a riconoscerlo al reimport. */
const epicodeId = () => text('epicode_id').notNull();
const title = () => text('title').notNull();
const position = () => integer('position').notNull().default(0);

// Vincoli ripetuti: testi non vuoti e di lunghezza ragionevole, posizioni ≥ 0.
const titleCheck = (table: string, column: { name: string }) =>
  check(`${table}_title_check`, sql`char_length(${sql.identifier(column.name)}) between 1 and 300`);
const positionCheck = (table: string) => check(`${table}_position_check`, sql`position >= 0`);
const epicodeIdCheck = (table: string) =>
  check(`${table}_epicode_id_check`, sql`epicode_id ~ '^[A-Za-z0-9-]{1,64}$'`);

// ---------------------------------------------------------------------------
// Catalogo
// ---------------------------------------------------------------------------

/** Corso di studi (es. Full-Stack Web Development). */
export const studyPrograms = pgTable(
  'study_programs',
  { id: id(), epicodeId: epicodeId(), title: title(), createdAt: createdAt() },
  (t) => [
    unique('study_programs_epicode_id_key').on(t.epicodeId),
    titleCheck('study_programs', t.title),
    epicodeIdCheck('study_programs'),
    pgPolicy('study_programs_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (select 1 from editions e where e.study_program_id = ${t.id})`,
    }),
  ],
).enableRLS();

/** Edizione o anno di un corso di studi (es. 2026). */
export const editions = pgTable(
  'editions',
  {
    id: id(),
    studyProgramId: uuid('study_program_id')
      .notNull()
      .references(() => studyPrograms.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('editions_program_label_key').on(t.studyProgramId, t.label),
    check('editions_label_check', sql`char_length(label) between 1 and 64`),
    pgPolicy('editions_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (select 1 from subjects s where s.edition_id = ${t.id})`,
    }),
  ],
).enableRLS();

/** Materia o modulo (in Directus: `unit`). */
export const subjects = pgTable(
  'subjects',
  {
    id: id(),
    editionId: uuid('edition_id')
      .notNull()
      .references(() => editions.id, { onDelete: 'cascade' }),
    epicodeId: epicodeId(),
    title: title(),
    position: position(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('subjects_edition_epicode_key').on(t.editionId, t.epicodeId),
    titleCheck('subjects', t.title),
    positionCheck('subjects'),
    epicodeIdCheck('subjects'),
    pgPolicy('subjects_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (select 1 from chapters c where c.subject_id = ${t.id})`,
    }),
  ],
).enableRLS();

/** Capitolo (in Directus: `module`). */
export const chapters = pgTable(
  'chapters',
  {
    id: id(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    epicodeId: epicodeId(),
    title: title(),
    position: position(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('chapters_subject_epicode_key').on(t.subjectId, t.epicodeId),
    titleCheck('chapters', t.title),
    positionCheck('chapters'),
    epicodeIdCheck('chapters'),
    pgPolicy('chapters_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (select 1 from lessons l where l.chapter_id = ${t.id})`,
    }),
  ],
).enableRLS();

/** Lezione (in Directus: `activity`). */
export const lessons = pgTable(
  'lessons',
  {
    id: id(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    epicodeId: epicodeId(),
    title: title(),
    position: position(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('lessons_chapter_epicode_key').on(t.chapterId, t.epicodeId),
    titleCheck('lessons', t.title),
    positionCheck('lessons'),
    epicodeIdCheck('lessons'),
    pgPolicy('lessons_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (select 1 from lesson_parts p where p.lesson_id = ${t.id})`,
    }),
  ],
).enableRLS();

/** Parte di lezione: l'unità su cui si concedono i permessi. */
export const lessonParts = pgTable(
  'lesson_parts',
  {
    id: id(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    epicodeId: epicodeId(),
    kind: lessonPartKind('kind').notNull(),
    title: title(),
    position: position(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('lesson_parts_lesson_epicode_key').on(t.lessonId, t.epicodeId),
    titleCheck('lesson_parts', t.title),
    positionCheck('lesson_parts'),
    epicodeIdCheck('lesson_parts'),
    pgPolicy('lesson_parts_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (
        select 1 from entitlements en
        where en.lesson_part_id = ${t.id} and en.user_id = ${authUid}
      )`,
    }),
  ],
).enableRLS();

/**
 * Versione del contenuto di una parte, identificata dall'impronta SHA-256 del
 * contenuto canonico (calcolata dal server con `computeContentHash` del core).
 * `content` è il contenuto canonico in JSON (riassunti, sottotitoli o markdown).
 */
export const contentVersions = pgTable(
  'content_versions',
  {
    id: id(),
    lessonPartId: uuid('lesson_part_id')
      .notNull()
      .references(() => lessonParts.id, { onDelete: 'cascade' }),
    contentHash: text('content_hash').notNull(),
    content: jsonb('content').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    generationStatus: generationStatus('generation_status').notNull().default('pending'),
    generationUpdatedAt: timestamp('generation_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Deduplica: lo stesso contenuto della stessa parte esiste una volta sola.
    unique('content_versions_part_hash_key').on(t.lessonPartId, t.contentHash),
    // Serve alla chiave esterna composta di `entitlements`.
    unique('content_versions_id_part_key').on(t.id, t.lessonPartId),
    check('content_versions_hash_check', sql`content_hash ~ '^[0-9a-f]{64}$'`),
    // Limite di sicurezza sulla dimensione (≈ 2 MB), coerente con i limiti del core.
    check('content_versions_size_check', sql`pg_column_size(content) <= 2097152`),
    // Il server MCP cerca le versioni da generare: indice parziale, piccolo e mirato.
    index('content_versions_pending_idx')
      .on(t.firstSeenAt)
      .where(sql`generation_status in ('pending', 'failed')`),
    pgPolicy('content_versions_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (
        select 1 from entitlements en
        where en.content_version_id = ${t.id} and en.user_id = ${authUid}
      )`,
    }),
  ],
).enableRLS();

/**
 * Permesso di uno studente su una versione. La chiave esterna composta
 * garantisce che versione e parte siano coerenti tra loro.
 */
export const entitlements = pgTable(
  'entitlements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    lessonPartId: uuid('lesson_part_id').notNull(),
    contentVersionId: uuid('content_version_id').notNull(),
    basis: entitlementBasis('basis').notNull().default('possession_proof'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'entitlements_pkey', columns: [t.userId, t.contentVersionId] }),
    foreignKey({
      name: 'entitlements_version_part_fkey',
      columns: [t.contentVersionId, t.lessonPartId],
      foreignColumns: [contentVersions.id, contentVersions.lessonPartId],
    }).onDelete('cascade'),
    // Le policy del catalogo cercano per (utente, parte) e per versione.
    index('entitlements_user_part_idx').on(t.userId, t.lessonPartId),
    index('entitlements_version_idx').on(t.contentVersionId),
    pgPolicy('entitlements_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();
