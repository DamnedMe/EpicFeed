import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDatabase } from '../src/testing.js';

// Tabelle aggiunte con M1: tracce di sottotitoli, token di import, registro.
const anna = '0a0a0a0a-0000-4000-8000-00000000000a';
const bruno = '0b0b0b0b-0000-4000-8000-00000000000b';

let db: PGlite;
let partId: string;
let trackId: string;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users (id) values ('${anna}'), ('${bruno}')`);
  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: string }>(sql, params)).rows[0]?.id ?? '';
  const program = await one(
    `insert into study_programs (epicode_id, title) values ('5', 'EIT') returning id`,
  );
  const edition = await one(
    `insert into editions (study_program_id, label) values ($1, '2024/25') returning id`,
    [program],
  );
  const subject = await one(
    `insert into subjects (edition_id, epicode_id, title) values ($1, '177', 'DSA') returning id`,
    [edition],
  );
  const chapter = await one(
    `insert into chapters (subject_id, epicode_id, title) values ($1, '66855', 'Trees') returning id`,
    [subject],
  );
  const lesson = await one(
    `insert into lessons (chapter_id, epicode_id, title) values ($1, '66863', 'Binary trees') returning id`,
    [chapter],
  );
  partId = await one(
    `insert into lesson_parts (lesson_id, epicode_id, kind, title, video_id)
     values ($1, '66864', 'video', 'Properties', '1034168708') returning id`,
    [lesson],
  );
  trackId = await one(
    `insert into subtitle_tracks (lesson_part_id, language, auto_generated, content_hash, cues)
     values ($1, 'it', false, $2, '[]') returning id`,
    [partId, 'c'.repeat(64)],
  );
  await db.query(`insert into subtitle_access (user_id, subtitle_track_id) values ($1, $2)`, [
    anna,
    trackId,
  ]);
  await db.query(
    `insert into api_tokens (user_id, scope, token_hash, label, expires_at)
     values ($1, 'import', $2, 'Estensione', now() + interval '30 days')`,
    [anna, 'd'.repeat(64)],
  );
  await db.query(`insert into import_events (user_id, lesson_id, part_count) values ($1, $2, 3)`, [
    anna,
    lesson,
  ]);
});

afterAll(async () => {
  await db.close();
});

const tables = ['subtitle_tracks', 'subtitle_access', 'api_tokens', 'import_events'];

describe('RLS delle tabelle di M1', () => {
  it.each(tables)('chi ha importato vede le proprie righe in %s', async (table) => {
    const rows = await asUser(db, anna, (q) => q(`select * from ${table}`));
    expect(rows).toHaveLength(1);
  });

  it.each(tables)('un altro studente non vede nulla in %s', async (table) => {
    const rows = await asUser(db, bruno, (q) => q(`select * from ${table}`));
    expect(rows).toEqual([]);
  });

  it.each(tables)('anon non ha privilegi su %s', async (table) => {
    await expect(asUser(db, null, (q) => q(`select * from ${table}`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each([
    `insert into subtitle_access (user_id, subtitle_track_id) values ('${bruno}', (select id from subtitle_tracks limit 1))`,
    `insert into api_tokens (user_id, scope, token_hash, label, expires_at) values ('${bruno}', 'import', '${'e'.repeat(64)}', 'x', now() + interval '1 day')`,
    `update api_tokens set revoked_at = null`,
    `delete from import_events`,
  ])('scrittura negata dal client: %s', async (statement) => {
    await expect(asUser(db, bruno, (q) => q(statement))).rejects.toThrow(/permission denied/);
  });
});

describe('Integrità delle tabelle di M1', () => {
  it('non accetta due volte la stessa traccia della stessa parte', async () => {
    await expect(
      db.query(
        `insert into subtitle_tracks (lesson_part_id, language, auto_generated, content_hash, cues)
         values ($1, 'it', false, $2, '[]')`,
        [partId, 'c'.repeat(64)],
      ),
    ).rejects.toThrow(/subtitle_tracks_part_hash_key/);
  });

  it('rifiuta lingue non valide', async () => {
    await expect(
      db.query(
        `insert into subtitle_tracks (lesson_part_id, language, auto_generated, content_hash, cues)
         values ($1, 'IT!', false, $2, '[]')`,
        [partId, 'f'.repeat(64)],
      ),
    ).rejects.toThrow(/subtitle_tracks_language_check/);
  });

  it('accetta video_id solo su parti video e solo numerico', async () => {
    await expect(
      db.query(`update lesson_parts set video_id = 'abc' where id = $1`, [partId]),
    ).rejects.toThrow(/lesson_parts_video_id_check/);
    await expect(
      db.query(`update lesson_parts set kind = 'reading' where id = $1`, [partId]),
    ).rejects.toThrow(/lesson_parts_video_id_check/);
  });

  it('rifiuta un token con impronta non valida o già scaduto alla creazione', async () => {
    await expect(
      db.query(
        `insert into api_tokens (user_id, scope, token_hash, label, expires_at)
         values ($1, 'import', 'segreto-in-chiaro', 'x', now() + interval '1 day')`,
        [anna],
      ),
    ).rejects.toThrow(/api_tokens_hash_check/);
    await expect(
      db.query(
        `insert into api_tokens (user_id, scope, token_hash, label, expires_at)
         values ($1, 'import', $2, 'x', now() - interval '1 day')`,
        [anna, '1'.repeat(64)],
      ),
    ).rejects.toThrow(/api_tokens_expiry_check/);
  });
});
