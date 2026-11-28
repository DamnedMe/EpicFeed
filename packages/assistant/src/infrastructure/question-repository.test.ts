import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserId } from '@epicfeed/shared';
import type { Database } from '@epicfeed/db';
import { setupTestDatabase as setup, TEST_USERS } from '@epicfeed/db/testing';
import {
  AnswerQuestion,
  AskQuestion,
  DeleteQuestion,
  ListQuestions,
} from '../application/questions.js';
import { DrizzleQuestionRepository } from './question-repository.js';

const anna = TEST_USERS.anna as UserId;
const bruno = TEST_USERS.bruno as UserId;
const clock = { now: () => new Date('2026-11-28T12:00:00Z') };

let pg: PGlite;
let db: Database;
let repo: DrizzleQuestionRepository;
let subject: string;
let lesson: string;

/** Una materia con una lezione, importata solo da Anna. */
beforeAll(async () => {
  ({ pg, db } = await setup());
  repo = new DrizzleQuestionRepository(db);
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

const id = (n: number) => `f0f0f0f0-0000-4000-8000-00000000000${String(n)}`;
const ask = (n: number) => ({
  id: id(n),
  subjectId: subject,
  lessonId: lesson,
  itemType: 'card' as const,
  itemId: 'stack-rule',
  question: `  Domanda ${String(n)}?  `,
  language: 'it' as const,
});

describe('DrizzleQuestionRepository', () => {
  it('mette in coda, elenca, risponde e cancella le domande di uno studente', async () => {
    const asking = new AskQuestion(repo);
    const saved = await asking.execute(anna, ask(1));
    expect(saved).toMatchObject({
      created: true,
      question: { status: 'pending', question: 'Domanda 1?', answer: null, answeredAt: null },
    });
    expect((await asking.execute(anna, ask(1))).created).toBe(false);
    await asking.execute(anna, ask(2));

    const list = new ListQuestions(repo);
    expect((await list.execute(anna, 'all')).map((q) => q.id)).toEqual([id(2), id(1)]);
    expect((await list.execute(anna, 'pending')).map((q) => q.id)).toEqual([id(1), id(2)]);
    expect(await list.execute(bruno, 'all')).toEqual([]);
    expect(await repo.count(anna)).toEqual({ total: 2, pending: 2 });

    await new AnswerQuestion(repo, clock).execute(anna, id(1), ' Perché sì. ');
    const answered = await repo.load(anna, id(1));
    expect(answered).toMatchObject({
      status: 'answered',
      answer: 'Perché sì.',
      answeredAt: '2026-11-28T12:00:00.000Z',
    });
    await expect(
      new AnswerQuestion(repo, clock).execute(anna, id(1), 'Di nuovo'),
    ).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    expect(await repo.answer(anna, id(1), 'x', clock.now())).toBe(false);
    expect((await list.execute(anna, 'pending')).map((q) => q.id)).toEqual([id(2)]);

    await expect(new DeleteQuestion(repo).execute(bruno, id(2))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await new DeleteQuestion(repo).execute(anna, id(2));
    expect(await repo.count(anna)).toEqual({ total: 1, pending: 0 });
  });

  it('rifiuta lezioni non importate e id già usati da altri', async () => {
    const asking = new AskQuestion(repo);
    await expect(asking.execute(bruno, ask(3))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await pg.query(
      `insert into entitlements (user_id, lesson_part_id, content_version_id)
       select $1, lesson_part_id, content_version_id from entitlements where user_id = $2`,
      [bruno, anna],
    );
    await expect(asking.execute(bruno, ask(1))).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    expect(await repo.count(anna)).toEqual({ total: 1, pending: 0 });
  });
});
