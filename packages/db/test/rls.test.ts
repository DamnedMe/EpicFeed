import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDatabase, inRollback } from './harness.js';

// Due studenti: Anna ha importato la lezione, Bruno no.
const anna = '0a0a0a0a-0000-4000-8000-00000000000a';
const bruno = '0b0b0b0b-0000-4000-8000-00000000000b';
const hashV1 = 'a'.repeat(64);
const hashV2 = 'b'.repeat(64);

let db: PGlite;
let partId: string;
let otherPartId: string;
let v1: string;
let v2: string;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into auth.users (id) values ('${anna}'), ('${bruno}')`);

  // Il catalogo lo scrive l'API sul server (ruolo privilegiato).
  const one = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ id: string }>(sql, params)).rows[0]?.id ?? '';
  const program = await one(
    `insert into study_programs (epicode_id, title) values ('fs', 'Full-Stack') returning id`,
  );
  const edition = await one(
    `insert into editions (study_program_id, label) values ($1, '2026') returning id`,
    [program],
  );
  const subject = await one(
    `insert into subjects (edition_id, epicode_id, title) values ($1, 'js', 'JavaScript') returning id`,
    [edition],
  );
  const chapter = await one(
    `insert into chapters (subject_id, epicode_id, title) values ($1, '10', 'Funzioni') returning id`,
    [subject],
  );
  const lesson = await one(
    `insert into lessons (chapter_id, epicode_id, title) values ($1, '100', 'Closure') returning id`,
    [chapter],
  );
  partId = await one(
    `insert into lesson_parts (lesson_id, epicode_id, kind, title) values ($1, '1000', 'video', 'Parte 1') returning id`,
    [lesson],
  );
  otherPartId = await one(
    `insert into lesson_parts (lesson_id, epicode_id, kind, title, position) values ($1, '1001', 'video', 'Parte 2', 1) returning id`,
    [lesson],
  );
  v1 = await one(
    `insert into content_versions (lesson_part_id, content_hash, content) values ($1, $2, '{"kind":"video"}') returning id`,
    [partId, hashV1],
  );
  v2 = await one(
    `insert into content_versions (lesson_part_id, content_hash, content) values ($1, $2, '{"kind":"video"}') returning id`,
    [partId, hashV2],
  );
  await db.query(
    `insert into entitlements (user_id, lesson_part_id, content_version_id) values ($1, $2, $3)`,
    [anna, partId, v1],
  );
});

afterAll(async () => {
  await db.close();
});

describe('RLS: chi ha importato la lezione', () => {
  it('vede il proprio permesso e la versione importata, non le altre', async () => {
    const rows = await asUser(db, anna, async (q) => ({
      entitlements: await q<{ content_version_id: string }>(
        'select content_version_id from entitlements',
      ),
      versions: await q<{ id: string }>('select id from content_versions'),
    }));
    expect(rows.entitlements.map((r) => r.content_version_id)).toEqual([v1]);
    expect(rows.versions.map((r) => r.id)).toEqual([v1]);
  });

  it('vede la parte importata ma non le altre parti della stessa lezione', async () => {
    const parts = await asUser(db, anna, (q) => q<{ id: string }>('select id from lesson_parts'));
    expect(parts.map((r) => r.id)).toEqual([partId]);
    expect(parts.map((r) => r.id)).not.toContain(otherPartId);
  });

  it('vede la gerarchia del catalogo fino al corso di studi', async () => {
    const counts = await asUser(db, anna, (q) =>
      q<Record<string, number>>(`select
        (select count(*)::int from lessons) as lessons,
        (select count(*)::int from chapters) as chapters,
        (select count(*)::int from subjects) as subjects,
        (select count(*)::int from editions) as editions,
        (select count(*)::int from study_programs) as programs`),
    );
    expect(counts[0]).toEqual({ lessons: 1, chapters: 1, subjects: 1, editions: 1, programs: 1 });
  });
});

describe('RLS: chi non ha importato la lezione', () => {
  it.each([
    'entitlements',
    'content_versions',
    'lesson_parts',
    'lessons',
    'chapters',
    'subjects',
    'editions',
    'study_programs',
  ])('non vede nulla in %s', async (table) => {
    const rows = await asUser(db, bruno, (q) => q(`select * from ${table}`));
    expect(rows).toEqual([]);
  });
});

describe('Accesso non autenticato (anon)', () => {
  it('non ha alcun privilegio sulle tabelle', async () => {
    await expect(asUser(db, null, (q) => q('select * from content_versions'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('Scritture dal client', () => {
  it('uno studente non può concedersi un permesso', async () => {
    await expect(
      asUser(db, bruno, (q) =>
        q(
          'insert into entitlements (user_id, lesson_part_id, content_version_id) values ($1, $2, $3)',
          [bruno, partId, v1],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it.each([
    `update content_versions set generation_status = 'ready'`,
    `delete from entitlements`,
    `insert into lessons (chapter_id, epicode_id, title) values (gen_random_uuid(), '1', 'x')`,
  ])('negato: %s', async (statement) => {
    await expect(asUser(db, anna, (q) => q(statement))).rejects.toThrow(/permission denied/);
  });
});

describe('Integrità dei dati', () => {
  it('non accetta due volte lo stesso contenuto della stessa parte', async () => {
    await expect(
      db.query(
        `insert into content_versions (lesson_part_id, content_hash, content) values ($1, $2, '{}')`,
        [partId, hashV1],
      ),
    ).rejects.toThrow(/content_versions_part_hash_key/);
  });

  it('rifiuta impronte non valide', async () => {
    await expect(
      db.query(
        `insert into content_versions (lesson_part_id, content_hash, content) values ($1, 'abc', '{}')`,
        [partId],
      ),
    ).rejects.toThrow(/content_versions_hash_check/);
  });

  it('rifiuta un permesso con versione e parte incoerenti', async () => {
    await expect(
      db.query(
        'insert into entitlements (user_id, lesson_part_id, content_version_id) values ($1, $2, $3)',
        [bruno, otherPartId, v2],
      ),
    ).rejects.toThrow(/entitlements_version_part_fkey/);
  });

  it('cancellando un utente si cancellano i suoi permessi', async () => {
    const remaining = await inRollback(db, async (tx) => {
      await tx.query('delete from auth.users where id = $1', [anna]);
      return (await tx.query('select * from entitlements where user_id = $1', [anna])).rows;
    });
    expect(remaining).toEqual([]);
  });

  it('rifiuta id Epicode con caratteri non sicuri', async () => {
    await expect(
      db.query(`insert into study_programs (epicode_id, title) values ('../x', 'X')`),
    ).rejects.toThrow(/study_programs_epicode_id_check/);
  });
});
