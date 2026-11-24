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
  bigint,
  boolean,
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
// Tipi enumerati (allineati ai tipi del dominio in @epicfeed/core)
// ---------------------------------------------------------------------------

/** Tipo di parte di lezione: video (riassunti + sottotitoli) o testo da leggere. */
export const lessonPartKind = pgEnum('lesson_part_kind', ['video', 'reading', 'slides']);

/** Stato di generazione di schede e quiz di una versione (ADR 0007). */
export const generationStatus = pgEnum('generation_status', [
  'pending',
  'generating',
  'ready',
  'failed',
]);

/** Base del permesso: oggi solo la prova di possesso (ADR 0002, fase 1). */
export const entitlementBasis = pgEnum('entitlement_basis', ['possession_proof']);

/**
 * Ambito di un token personale: `import` per l'estensione (M1), `generate`
 * per il server MCP di Claude Desktop (M2, ADR 0013).
 */
export const apiTokenScope = pgEnum('api_token_scope', ['import', 'generate']);

/** Azione registrata per il limite di frequenza della generazione. */
export const generationAction = pgEnum('generation_action', ['read', 'save', 'slides']);

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
    /** Id del video Vimeo (solo parti video): collega riassunti e sottotitoli al video. */
    videoId: text('video_id'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('lesson_parts_lesson_epicode_key').on(t.lessonId, t.epicodeId),
    check(
      'lesson_parts_video_id_check',
      sql`video_id is null or (kind = 'video' and video_id ~ '^[0-9]{1,20}$')`,
    ),
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
    // Copre anche la chiave esterna composta (versione, parte): senza, ogni
    // cancellazione di una versione scorrerebbe tutta la tabella.
    index('entitlements_version_part_idx').on(t.contentVersionId, t.lessonPartId),
    pgPolicy('entitlements_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Sottotitoli (ADR 0006): tracce separate dalle versioni
// ---------------------------------------------------------------------------

/**
 * Traccia di sottotitoli di una parte video, deduplicata per impronta come le
 * versioni. È separata dal contenuto della versione: una traccia nuova o
 * corretta non crea una nuova versione della lezione. `cues` è la traccia in
 * forma canonica (righe con tempi in millisecondi).
 */
export const subtitleTracks = pgTable(
  'subtitle_tracks',
  {
    id: id(),
    lessonPartId: uuid('lesson_part_id')
      .notNull()
      .references(() => lessonParts.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    autoGenerated: boolean('auto_generated').notNull(),
    contentHash: text('content_hash').notNull(),
    cues: jsonb('cues').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('subtitle_tracks_part_hash_key').on(t.lessonPartId, t.contentHash),
    check('subtitle_tracks_hash_check', sql`content_hash ~ '^[0-9a-f]{64}$'`),
    check('subtitle_tracks_language_check', sql`language ~ '^[a-z]{2,3}(-[a-z0-9]{1,8}){0,3}$'`),
    check('subtitle_tracks_size_check', sql`pg_column_size(cues) <= 2097152`),
    pgPolicy('subtitle_tracks_select_entitled', {
      for: 'select',
      to: authenticatedRole,
      using: sql`exists (
        select 1 from subtitle_access sa
        where sa.subtitle_track_id = ${t.id} and sa.user_id = ${authUid}
      )`,
    }),
  ],
).enableRLS();

/** Permesso di uno studente su una traccia (prova di possesso, come le versioni). */
export const subtitleAccess = pgTable(
  'subtitle_access',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    subtitleTrackId: uuid('subtitle_track_id')
      .notNull()
      .references(() => subtitleTracks.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'subtitle_access_pkey', columns: [t.userId, t.subtitleTrackId] }),
    // Copre la chiave esterna verso la traccia (cancellazioni a cascata).
    index('subtitle_access_track_idx').on(t.subtitleTrackId),
    pgPolicy('subtitle_access_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Accesso dell'estensione e limiti di frequenza
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Generazione (M2, ADR 0013): feed per lezione e glossario per materia
// ---------------------------------------------------------------------------

/**
 * Feed di una lezione (schede, quiz, concetti in italiano e inglese), generato
 * da Claude Desktop tramite il server MCP. Una riga per lezione e per impronta
 * delle fonti (`computeLessonSourcesHash` del core): il primo feed per un
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
    /** Termine normalizzato (`glossaryKey` del core): minuscolo, spazi compattati. */
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

// ---------------------------------------------------------------------------
// Progressi di studio sincronizzati (M4, ADR 0018)
// ---------------------------------------------------------------------------

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
