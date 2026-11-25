import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserId } from '@epicfeed/shared';
import type { Database } from '@epicfeed/db';
import { setupTestDatabase as setup, TEST_USERS } from '@epicfeed/db/testing';
import type { CorrectionDraft } from '../domain/corrections.js';
import {
  CompleteCorrection,
  ListCorrections,
  ReportError,
  WithdrawCorrection,
} from '../application/corrections.js';
import { DrizzleCorrectionRepository } from './correction-repository.js';

const anna = TEST_USERS.anna as UserId;
const bruno = TEST_USERS.bruno as UserId;
const clock = { now: () => new Date('2026-11-25T12:00:00Z') };

let pg: PGlite;
let db: Database;
let repo: DrizzleCorrectionRepository;
let subject: string;
let lesson: string;

/** Una materia con una lezione, importata solo da Anna. */
beforeAll(async () => {
  ({ pg, db } = await setup());
  repo = new DrizzleCorrectionRepository(db);
  const one = async (sql: string, params: unknown[] = []) =>
    (await pg.query<{ id: string }>(sql, params)).rows[0]?.id ?? '';
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
    `insert into chapters (subject_id, epicode_id, title) values ($1, '1', 'Stacks') returning id`,
    [subject],
  );
  lesson = await one(
    `insert into lessons (chapter_id, epicode_id, title) values ($1, '2', 'Stacks') returning id`,
    [chapter],
  );
  const part = await one(
    `insert into lesson_parts (lesson_id, epicode_id, kind, title) values ($1, '3', 'reading', 'Parte') returning id`,
    [lesson],
  );
  const version = await one(
    `insert into content_versions (lesson_part_id, content_hash, content) values ($1, $2, '{}') returning id`,
    [part, 'a'.repeat(64)],
  );
  await pg.query(
    `insert into entitlements (user_id, lesson_part_id, content_version_id) values ($1, $2, $3)`,
    [anna, part, version],
  );
});

afterAll(async () => {
  await pg.close();
});

const id = (n: number) => `e0e0e0e0-0000-4000-8000-00000000000${n}`;
const text = (): CorrectionDraft => ({
  kind: 'text',
  lessonId: lesson,
  itemType: 'card',
  itemId: 'stack-rule',
  edits: [{ field: 'keyPoint', language: 'it', original: 'FIFO', corrected: 'LIFO' }],
  reason: 'content',
  snapshot: { id: 'stack-rule' },
});

describe('DrizzleCorrectionRepository', () => {
  it('salva, elenca, completa e annulla le correzioni di uno studente', async () => {
    const report = new ReportError(repo);
    const saved = await report.execute(anna, { id: id(1), subjectId: subject, correction: text() });
    expect(saved).toMatchObject({ created: true, correction: { claudeStatus: 'pending' } });
    expect(
      (await report.execute(anna, { id: id(1), subjectId: subject, correction: text() })).created,
    ).toBe(false);
    await report.execute(anna, {
      id: id(2),
      subjectId: subject,
      correction: { kind: 'term', from: 'Big 0', to: 'Big O', reason: 'content' },
    });

    const list = new ListCorrections(repo);
    expect((await list.execute(anna, 'all')).map((c) => c.id)).toEqual([id(1), id(2)]);
    expect((await list.execute(anna, 'pending')).map((c) => c.id)).toEqual([id(1)]);
    expect(await list.execute(bruno, 'all')).toEqual([]);

    await new CompleteCorrection(repo, clock).execute(anna, id(1), {
      outcome: 'done',
      edits: [{ field: 'keyPoint', language: 'en', original: 'FIFO', corrected: 'LIFO' }],
    });
    const [done] = await list.execute(anna, 'all');
    expect(done).toMatchObject({ claudeStatus: 'done', completion: { outcome: 'done' } });

    await expect(new WithdrawCorrection(repo).execute(bruno, id(2))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await new WithdrawCorrection(repo).execute(anna, id(2));
    expect(await repo.count(anna)).toBe(1);
  });

  it('rifiuta lezioni non importate e id già usati da altri', async () => {
    const report = new ReportError(repo);
    await expect(
      report.execute(bruno, { id: id(3), subjectId: subject, correction: text() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Bruno importa la stessa lezione ma prova a riusare l'id di Anna.
    await pg.query(
      `insert into entitlements (user_id, lesson_part_id, content_version_id)
       select $1, lesson_part_id, content_version_id from entitlements where user_id = $2`,
      [bruno, anna],
    );
    await expect(
      report.execute(bruno, { id: id(1), subjectId: subject, correction: text() }),
    ).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    expect(await repo.count(anna)).toBe(1);
  });
});
