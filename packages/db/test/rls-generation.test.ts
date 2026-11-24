import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDatabase } from '../src/testing.js';

// Tabelle aggiunte con M2 (feed delle lezioni, glossario, registro della generazione)
// e con M4 (pacchetti d'esame dei feed).
const anna = '0a0a0a0a-0000-4000-8000-00000000000a';
const bruno = '0b0b0b0b-0000-4000-8000-00000000000b';
const carla = '0c0c0c0c-0000-4000-8000-00000000000c';

let db: PGlite;
let lesson: string;
let subject: string;
let versionA: string;
let versionB: string;
let feed: string;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users (id) values ('${anna}'), ('${bruno}'), ('${carla}')`);
  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: string }>(sql, params)).rows[0]?.id ?? '';
  const program = await one(
    `insert into study_programs (epicode_id, title) values ('5', 'EIT') returning id`,
  );
  const edition = await one(
    `insert into editions (study_program_id, label) values ($1, '2024/25') returning id`,
    [program],
  );
  subject = await one(
    `insert into subjects (edition_id, epicode_id, title) values ($1, '177', 'DSA') returning id`,
    [edition],
  );
  const chapter = await one(
    `insert into chapters (subject_id, epicode_id, title) values ($1, '66855', 'Trees') returning id`,
    [subject],
  );
  lesson = await one(
    `insert into lessons (chapter_id, epicode_id, title) values ($1, '66863', 'Binary trees') returning id`,
    [chapter],
  );
  const part = async (epicodeId: string) =>
    one(
      `insert into lesson_parts (lesson_id, epicode_id, kind, title) values ($1, $2, 'reading', 'Parte') returning id`,
      [lesson, epicodeId],
    );
  const partA = await part('1');
  const partB = await part('2');
  const version = async (partId: string, hash: string) =>
    one(
      `insert into content_versions (lesson_part_id, content_hash, content) values ($1, $2, '{}') returning id`,
      [partId, hash.repeat(64)],
    );
  versionA = await version(partA, 'a');
  versionB = await version(partB, 'b');
  const grant = (user: string, partId: string, versionId: string) =>
    db.query(
      `insert into entitlements (user_id, lesson_part_id, content_version_id) values ($1, $2, $3)`,
      [user, partId, versionId],
    );
  // Anna possiede entrambe le parti, Carla solo la prima, Bruno nessuna.
  await grant(anna, partA, versionA);
  await grant(anna, partB, versionB);
  await grant(carla, partA, versionA);

  feed = await one(
    `insert into lesson_feeds (lesson_id, sources_hash, prompt_version, feed, source_version_ids, generated_by)
     values ($1, $2, '2026-11-21.1', '{}', $3, $4) returning id`,
    [lesson, 'f'.repeat(64), `{${versionA},${versionB}}`, anna],
  );
  await db.query(
    `insert into lesson_exam_packs (lesson_feed_id, prompt_version, pack, generated_by)
     values ($1, '2026-11-24.1', '{}', $2)`,
    [feed, anna],
  );
  await db.query(
    `insert into glossary_terms (subject_id, term, term_key, translation, definition)
     values ($1, 'Balance Factor', 'balance factor', 'fattore di bilanciamento', '{"it":"x","en":"y"}')`,
    [subject],
  );
  await db.query(
    `insert into generation_events (user_id, action, lesson_id) values ($1, 'save', $2)`,
    [anna, lesson],
  );
});

afterAll(async () => {
  await db.close();
});

const tables = ['lesson_feeds', 'glossary_terms', 'generation_events', 'lesson_exam_packs'];

describe('RLS delle tabelle di M2', () => {
  it.each(tables)('chi possiede le fonti vede le righe di %s', async (table) => {
    const rows = await asUser(db, anna, (q) => q(`select * from ${table}`));
    expect(rows).toHaveLength(1);
  });

  it.each(tables)('chi non ha importato nulla non vede %s', async (table) => {
    const rows = await asUser(db, bruno, (q) => q(`select * from ${table}`));
    expect(rows).toEqual([]);
  });

  it('un feed resta nascosto a chi possiede solo una parte delle sue fonti', async () => {
    const feeds = await asUser(db, carla, (q) => q(`select * from lesson_feeds`));
    expect(feeds).toEqual([]);
    // Con il feed resta nascosto anche il suo pacchetto d'esame.
    const packs = await asUser(db, carla, (q) => q(`select * from lesson_exam_packs`));
    expect(packs).toEqual([]);
    // Carla vede comunque la materia, quindi il glossario.
    const terms = await asUser(db, carla, (q) => q(`select * from glossary_terms`));
    expect(terms).toHaveLength(1);
    const events = await asUser(db, carla, (q) => q(`select * from generation_events`));
    expect(events).toEqual([]);
  });

  it.each(tables)('anon non ha privilegi su %s', async (table) => {
    await expect(asUser(db, null, (q) => q(`select * from ${table}`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each([
    `insert into lesson_feeds (lesson_id, sources_hash, prompt_version, feed, source_version_ids) values ((select id from lessons limit 1), '${'e'.repeat(64)}', '2026-11-21.1', '{}', '{}')`,
    `update lesson_feeds set feed = '{"hacked":true}'`,
    `insert into glossary_terms (subject_id, term, term_key, translation, definition) values ((select id from subjects limit 1), 'x', 'x', 'x', '{}')`,
    `delete from generation_events`,
    `update lesson_exam_packs set pack = '{"hacked":true}'`,
    `insert into lesson_exam_packs (lesson_feed_id, prompt_version, pack) values ((select id from lesson_feeds limit 1), '2026-11-24.1', '{}')`,
  ])('scrittura negata dal client: %s', async (statement) => {
    await expect(asUser(db, anna, (q) => q(statement))).rejects.toThrow(/permission denied/);
  });
});

describe('Integrità delle tabelle di M2', () => {
  it('accetta un solo feed per lezione e impronta delle fonti', async () => {
    await expect(
      db.query(
        `insert into lesson_feeds (lesson_id, sources_hash, prompt_version, feed, source_version_ids)
         values ($1, $2, '2026-11-21.1', '{}', $3)`,
        [lesson, 'f'.repeat(64), `{${versionA}}`],
      ),
    ).rejects.toThrow(/lesson_feeds_lesson_sources_key/);
  });

  it('rifiuta impronta, versione del prompt e fonti non valide', async () => {
    const insert = (hash: string, prompt: string, sources: string) =>
      db.query(
        `insert into lesson_feeds (lesson_id, sources_hash, prompt_version, feed, source_version_ids)
         values ($1, $2, $3, '{}', $4)`,
        [lesson, hash, prompt, sources],
      );
    await expect(insert('xyz', '2026-11-21.1', `{${versionA}}`)).rejects.toThrow(
      /lesson_feeds_hash_check/,
    );
    await expect(insert('1'.repeat(64), 'v1', `{${versionA}}`)).rejects.toThrow(
      /lesson_feeds_prompt_version_check/,
    );
    await expect(insert('1'.repeat(64), '2026-11-21.1', '{}')).rejects.toThrow(
      /lesson_feeds_sources_check/,
    );
  });

  it('non accetta due volte lo stesso termine nella stessa materia', async () => {
    await expect(
      db.query(
        `insert into glossary_terms (subject_id, term, term_key, translation, definition)
         values ($1, 'balance factor', 'balance factor', 'x', '{}')`,
        [subject],
      ),
    ).rejects.toThrow(/glossary_terms_subject_term_key/);
  });

  it('accetta il nuovo ambito di token "generate"', async () => {
    await db.query(
      `insert into api_tokens (user_id, scope, token_hash, label, expires_at)
       values ($1, 'generate', $2, 'Claude Desktop', now() + interval '90 days')`,
      [anna, '9'.repeat(64)],
    );
  });

  it("accetta un solo pacchetto d'esame per feed e solo versioni del prompt valide", async () => {
    await expect(
      db.query(
        `insert into lesson_exam_packs (lesson_feed_id, prompt_version, pack) values ($1, '2026-11-24.2', '{}')`,
        [feed],
      ),
    ).rejects.toThrow(/lesson_exam_packs_feed_key/);
    await expect(
      db.query(
        `insert into lesson_exam_packs (lesson_feed_id, prompt_version, pack) values ($1, 'v1', '{}')`,
        [feed],
      ),
    ).rejects.toThrow(/lesson_exam_packs_prompt_version_check/);
  });
});
