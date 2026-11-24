import { describe, expect, it } from 'vitest';
import type { ExamCorrectionDraft, ExamSubmissionDraft, UserId } from '../domain/index.js';
import { DomainError, FeedValidationError } from '../domain/index.js';
import type { ExamSubmissionRepository, StoredSubmission } from './exam-correction.js';
import {
  DeleteSubmission,
  ListSubmissions,
  SaveCorrection,
  SubmitForCorrection,
} from './exam-correction.js';

const user = '0a0a0a0a-0000-4000-8000-00000000000a' as UserId;
const subjectId = '30000000-0000-4000-8000-000000000001';
const clock = { now: () => new Date('2026-11-24T10:00:00.000Z') };

const draft: ExamSubmissionDraft = {
  subjectId,
  kind: 'exercise',
  items: [
    {
      key: 'bank:x',
      kind: 'explain',
      prompt: 'Explain.',
      code: null,
      answer: 'Because.',
      followUp: null,
      followUpAnswer: null,
      modelAnswer: 'Model.',
      rubric: [{ criterion: 'Clear', points: 2 }],
      conceptKeys: ['stack'],
      tests: null,
    },
  ],
};
const correction: ExamCorrectionDraft = {
  summary: 'Good.',
  items: [{ key: 'bank:x', scores: [2], comment: 'Fine.', suggestions: [] }],
};

/** Persistenza in memoria. */
function memory(visible = true) {
  const rows = new Map<string, StoredSubmission>();
  let purged = 0;
  const repository: ExamSubmissionRepository = {
    subjectVisible: () => Promise.resolve(visible),
    countPending: () => Promise.resolve([...rows.values()].filter((row) => !row.correction).length),
    create: (_user, submission) => {
      const id = `s${rows.size + 1}`;
      rows.set(id, {
        id,
        subjectId: submission.subjectId,
        kind: submission.kind,
        submission,
        correction: null,
        createdAt: clock.now().toISOString(),
        correctedAt: null,
      });
      return Promise.resolve(id);
    },
    list: (_user, filter) =>
      Promise.resolve([...rows.values()].filter((row) => filter === 'all' || !row.correction)),
    load: (_user, id) => Promise.resolve(rows.get(id) ?? null),
    saveCorrection: (_user, id, value, at) => {
      const row = rows.get(id);
      if (!row || row.correction) return Promise.resolve(false);
      rows.set(id, { ...row, correction: value, correctedAt: at.toISOString() });
      return Promise.resolve(true);
    },
    delete: (_user, id) => Promise.resolve(rows.delete(id)),
    purgeExpired: () => {
      purged += 1;
      return Promise.resolve(0);
    },
  };
  return { repository, rows, purges: () => purged };
}

describe('correzione di Claude', () => {
  it('invio, elenco, correzione e cancellazione', async () => {
    const { repository, purges } = memory();
    const { id } = await new SubmitForCorrection(repository).execute(user, draft);
    const list = new ListSubmissions(repository, clock);
    expect((await list.execute(user, 'pending')).map((row) => row.id)).toEqual([id]);
    expect(purges()).toBe(1);

    const save = new SaveCorrection(repository, clock);
    await save.execute(user, id, correction);
    expect(await list.execute(user, 'pending')).toEqual([]);
    const [row] = await list.execute(user, 'all');
    expect(row?.correctedAt).toBe('2026-11-24T10:00:00.000Z');
    await expect(save.execute(user, id, correction)).rejects.toMatchObject({
      code: 'ALREADY_DONE',
    });

    await new DeleteSubmission(repository).execute(user, id);
    await expect(new DeleteSubmission(repository).execute(user, id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rifiuta una correzione che non corrisponde all’invio', async () => {
    const { repository } = memory();
    const { id } = await new SubmitForCorrection(repository).execute(user, draft);
    await expect(
      new SaveCorrection(repository, clock).execute(user, id, {
        summary: '',
        items: [{ key: 'bank:x', scores: [5], comment: '', suggestions: [] }],
      }),
    ).rejects.toBeInstanceOf(FeedValidationError);
    await expect(
      new SaveCorrection(repository, clock).execute(user, 'missing', correction),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('materia non visibile o troppe risposte in attesa', async () => {
    await expect(
      new SubmitForCorrection(memory(false).repository).execute(user, draft),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { repository } = memory();
    const submit = new SubmitForCorrection(repository);
    for (let i = 0; i < 20; i += 1) await submit.execute(user, draft);
    await expect(submit.execute(user, draft)).rejects.toBeInstanceOf(DomainError);
    await expect(submit.execute(user, draft)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
  });
});
