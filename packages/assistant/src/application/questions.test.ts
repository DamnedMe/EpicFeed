import type { UserId } from '@epicfeed/shared';
import { describe, expect, it } from 'vitest';
import type { StoredQuestion } from '../domain/questions.js';
import { QUESTION_LIMITS } from '../domain/questions.js';
import type { NewQuestion, QuestionRepository } from './questions.js';
import {
  AnswerQuestion,
  AskQuestion,
  DeleteQuestion,
  ListQuestions,
  QuestionValidationError,
} from './questions.js';

const anna = 'anna' as UserId;
const clock = { now: () => new Date('2026-11-28T12:00:00Z') };

/** Repository in memoria, con conteggi impostabili per i limiti. */
function memory(counts?: { total: number; pending: number }): QuestionRepository & {
  rows: Map<string, StoredQuestion>;
  limits: number[];
} {
  const rows = new Map<string, StoredQuestion>();
  const limits: number[] = [];
  return {
    rows,
    limits,
    lessonInSubject: (_user, lessonId) => Promise.resolve(lessonId === 'lezione'),
    count: () =>
      Promise.resolve(
        counts ?? {
          total: rows.size,
          pending: [...rows.values()].filter((q) => q.status === 'pending').length,
        },
      ),
    insert: (_user, q: NewQuestion) => {
      rows.set(q.id, {
        ...q,
        status: 'pending',
        answer: null,
        createdAt: '2026-11-28T10:00:00.000Z',
        answeredAt: null,
      });
      return Promise.resolve(true);
    },
    load: (_user, id) => Promise.resolve(rows.get(id) ?? null),
    list: (_user, filter, limit) => {
      if (limit !== undefined) limits.push(limit);
      return Promise.resolve(
        [...rows.values()].filter((q) => filter === 'all' || q.status === 'pending'),
      );
    },
    answer: (_user, id, answer, at) => {
      const row = rows.get(id);
      if (row?.status !== 'pending') return Promise.resolve(false);
      rows.set(id, { ...row, status: 'answered', answer, answeredAt: at.toISOString() });
      return Promise.resolve(true);
    },
    delete: (_user, id) => Promise.resolve(rows.delete(id)),
  };
}

const input = (id = 'q1'): NewQuestion => ({
  id,
  subjectId: 'materia',
  lessonId: 'lezione',
  itemType: 'quiz',
  itemId: 'avl-case',
  question: ' Perché? ',
  language: 'en',
});

describe('domande in coda', () => {
  it('chiede, elenca, risponde e cancella', async () => {
    const repo = memory();
    const saved = await new AskQuestion(repo).execute(anna, input());
    expect(saved).toMatchObject({ created: true, question: { question: 'Perché?' } });
    expect((await new AskQuestion(repo).execute(anna, input())).created).toBe(false);
    expect(await new ListQuestions(repo).execute(anna, 'pending')).toHaveLength(1);
    expect(repo.limits).toEqual([QUESTION_LIMITS.batch]);
    expect(await new ListQuestions(repo).execute(anna, 'all')).toHaveLength(1);
    await new AnswerQuestion(repo, clock).execute(anna, 'q1', 'Risposta.');
    expect(repo.rows.get('q1')).toMatchObject({ status: 'answered', answer: 'Risposta.' });
    await expect(
      new AnswerQuestion(repo, clock).execute(anna, 'q1', 'Ancora'),
    ).rejects.toMatchObject({
      code: 'ALREADY_DONE',
    });
    await new DeleteQuestion(repo).execute(anna, 'q1');
    await expect(new DeleteQuestion(repo).execute(anna, 'q1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rifiuta domande vuote, lezioni non importate e risposte vuote', async () => {
    const repo = memory();
    await expect(
      new AskQuestion(repo).execute(anna, { ...input(), question: '  ' }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
    await expect(
      new AskQuestion(repo).execute(anna, { ...input(), lessonId: 'altra' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(new AnswerQuestion(repo, clock).execute(anna, 'manca', 'x')).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
    await expect(new AnswerQuestion(repo, clock).execute(anna, 'manca', ' ')).rejects.toMatchObject(
      {
        code: 'INVALID_CONTENT',
        issues: ['La risposta è vuota.'],
      },
    );
  });

  it('limiti: domande in attesa e totali', async () => {
    await expect(
      new AskQuestion(memory({ total: 1, pending: QUESTION_LIMITS.pending })).execute(
        anna,
        input(),
      ),
    ).rejects.toThrow(/in attesa/);
    await expect(
      new AskQuestion(memory({ total: QUESTION_LIMITS.total, pending: 0 })).execute(anna, input()),
    ).rejects.toThrow(/Le mie domande/);
  });

  it('un id usato da un altro studente non si salva', async () => {
    const repo = memory();
    repo.insert = () => Promise.resolve(false);
    await expect(new AskQuestion(repo).execute(anna, input())).rejects.toMatchObject({
      code: 'ALREADY_DONE',
    });
  });
});
