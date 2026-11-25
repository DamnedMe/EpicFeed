import { describe, expect, it } from 'vitest';
import type { UserId } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import type { CorrectionCompletion, StoredCorrection } from '../domain/corrections.js';
import { CORRECTION_LIMITS } from '../domain/corrections.js';
import { FeedValidationError } from '../domain/feed.js';
import type { CorrectionRepository, NewCorrection, ReportErrorInput } from './corrections.js';
import {
  CompleteCorrection,
  ListCorrections,
  ReportError,
  WithdrawCorrection,
} from './corrections.js';

const USER = 'aaaaaaaa-0000-4000-8000-000000000001' as UserId;
const SUBJECT = 'bbbbbbbb-0000-4000-8000-000000000001';
const LESSON = 'cccccccc-0000-4000-8000-000000000001';
const ID = 'dddddddd-0000-4000-8000-000000000001';

/** Repository in memoria: una materia con una lezione visibile. */
class MemoryRepository implements CorrectionRepository {
  rows = new Map<string, StoredCorrection & { userId: UserId }>();
  extraCount = 0;

  subjectVisible(_user: UserId, subjectId: string) {
    return Promise.resolve(subjectId === SUBJECT);
  }
  lessonInSubject(_user: UserId, lessonId: string, subjectId: string) {
    return Promise.resolve(lessonId === LESSON && subjectId === SUBJECT);
  }
  count(userId: UserId) {
    return Promise.resolve(this.own(userId).length + this.extraCount);
  }
  insert(userId: UserId, c: NewCorrection) {
    if (this.rows.has(c.id)) return Promise.resolve(false);
    this.rows.set(c.id, { ...c, userId, completion: null, createdAt: '2026-11-25T10:00:00.000Z' });
    return Promise.resolve(true);
  }
  load(userId: UserId, id: string) {
    return Promise.resolve(this.own(userId).find((c) => c.id === id) ?? null);
  }
  list(userId: UserId, filter: 'all' | 'pending') {
    return Promise.resolve(
      this.own(userId).filter((c) => filter === 'all' || c.claudeStatus === 'pending'),
    );
  }
  complete(userId: UserId, id: string, completion: CorrectionCompletion) {
    const row = this.rows.get(id);
    if (row?.userId !== userId || row.claudeStatus !== 'pending') return Promise.resolve(false);
    this.rows.set(id, {
      ...row,
      completion,
      claudeStatus: completion.outcome === 'done' ? 'done' : 'disputed',
    });
    return Promise.resolve(true);
  }
  delete(userId: UserId, id: string) {
    const row = this.rows.get(id);
    return Promise.resolve(row?.userId === userId && this.rows.delete(id));
  }

  /** Correzioni dello studente senza il campo interno `userId`. */
  private own(userId: UserId): StoredCorrection[] {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .map((r) => ({
        id: r.id,
        subjectId: r.subjectId,
        correction: r.correction,
        claudeStatus: r.claudeStatus,
        completion: r.completion,
        createdAt: r.createdAt,
      }));
  }
}

const clock = { now: () => new Date('2026-11-25T12:00:00Z') };

const input: ReportErrorInput = {
  id: ID,
  subjectId: SUBJECT,
  correction: {
    kind: 'text',
    lessonId: LESSON,
    itemType: 'card',
    itemId: 'stack-rule',
    edits: [{ field: 'keyPoint', language: 'it', original: 'FIFO', corrected: 'LIFO' }],
    reason: 'content',
    snapshot: {},
  },
};

describe('ReportError', () => {
  it('salva la correzione in attesa di Claude e non duplica un reinvio', async () => {
    const repo = new MemoryRepository();
    const report = new ReportError(repo);
    const first = await report.execute(USER, input);
    expect(first.created).toBe(true);
    expect(first.correction.claudeStatus).toBe('pending');
    const again = await report.execute(USER, input);
    expect(again.created).toBe(false);
    expect(repo.rows.size).toBe(1);
  });

  it('rifiuta lezioni non visibili, regole violate e il limite raggiunto', async () => {
    const repo = new MemoryRepository();
    const report = new ReportError(repo);
    await expect(
      report.execute(USER, {
        ...input,
        correction: { ...input.correction, lessonId: SUBJECT } as typeof input.correction,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      report.execute(USER, {
        ...input,
        correction: { kind: 'term', from: 'x', to: 'x', reason: 'content' },
      }),
    ).rejects.toBeInstanceOf(FeedValidationError);
    repo.extraCount = CORRECTION_LIMITS.perUser;
    await expect(report.execute(USER, input)).rejects.toMatchObject({ code: 'LIMIT_REACHED' });
  });
});

describe('CompleteCorrection e WithdrawCorrection', () => {
  it('Claude completa una sola volta, con la frase nell’altra lingua', async () => {
    const repo = new MemoryRepository();
    await new ReportError(repo).execute(USER, input);
    const complete = new CompleteCorrection(repo, clock);
    await expect(complete.execute(USER, ID, { outcome: 'done', edits: [] })).rejects.toBeInstanceOf(
      FeedValidationError,
    );
    await complete.execute(USER, ID, {
      outcome: 'done',
      edits: [{ field: 'keyPoint', language: 'en', original: 'FIFO', corrected: 'LIFO' }],
    });
    expect(await new ListCorrections(repo).execute(USER, 'pending')).toEqual([]);
    await expect(
      complete.execute(USER, ID, { outcome: 'disputed', note: 'No' }),
    ).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('annulla solo le correzioni dello studente', async () => {
    const repo = new MemoryRepository();
    await new ReportError(repo).execute(USER, input);
    const other = 'aaaaaaaa-0000-4000-8000-000000000002' as UserId;
    await expect(new WithdrawCorrection(repo).execute(other, ID)).rejects.toBeInstanceOf(
      DomainError,
    );
    await new WithdrawCorrection(repo).execute(USER, ID);
    expect(repo.rows.size).toBe(0);
  });
});
