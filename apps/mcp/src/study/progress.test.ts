import type { AnswerRecord, ProgressSnapshot } from '@epicfeed/review';
import type { ProgressPut } from '@epicfeed/review';
import { decryptSnapshot, derivePasswordKey, encryptSnapshot } from '@epicfeed/review/crypto';
import { describe, expect, it, vi } from 'vitest';
import { StudentProgress, progressProblem } from './progress.js';

const snapshot: ProgressSnapshot = {
  version: 1,
  answers: [
    {
      conceptId: 's:avl',
      questionId: null,
      source: 'feed',
      grade: 'again',
      language: 'it',
      at: '2026-11-27T10:00:00.000Z',
    },
  ],
  reviewDays: [],
  bestStreak: 0,
};

async function remote(password = 'una password lunga') {
  const key = await derivePasswordKey('anna@example.com', password);
  return { ...(await encryptSnapshot(key, snapshot)), revision: 4 };
}

describe('progressi decifrati sul PC', () => {
  it('apre la copia cifrata nel browser con email e password, ricavando la chiave una volta', async () => {
    const stored = await remote();
    const readProgress = vi.fn(() => Promise.resolve(stored));
    const reader = new StudentProgress(
      { readProgress, writeProgress: vi.fn() },
      { email: ' Anna@Example.com ', password: 'una password lunga' },
    );
    expect(await reader.read()).toEqual({ status: 'ok', snapshot });
    expect(await reader.read()).toEqual({ status: 'ok', snapshot });
    expect(readProgress).toHaveBeenCalledTimes(2);
  });

  it('dice perché non legge: credenziali mancanti, nessuna copia, password cambiata', async () => {
    const stored = await remote('vecchia password');
    expect(
      await new StudentProgress({ readProgress: vi.fn(), writeProgress: vi.fn() }, null).read(),
    ).toEqual({
      status: 'no_credentials',
    });
    const none = new StudentProgress(
      { readProgress: () => Promise.resolve(null), writeProgress: vi.fn() },
      { email: 'anna@example.com', password: 'x' },
    );
    expect(await none.read()).toEqual({ status: 'no_copy' });
    const wrong = new StudentProgress(
      { readProgress: () => Promise.resolve(stored), writeProgress: vi.fn() },
      { email: 'anna@example.com', password: 'nuova password' },
    );
    expect(await wrong.read()).toEqual({ status: 'wrong_password' });
    for (const status of ['no_credentials', 'no_copy', 'wrong_password', 'busy'] as const) {
      expect(progressProblem(status).length).toBeGreaterThan(20);
    }
  });

  const quizAnswer: AnswerRecord = {
    conceptId: 's:avl',
    questionId: 'l:quiz:q',
    source: 'quiz',
    grade: 'good',
    language: 'en',
    at: '2026-11-28T10:00:00.000Z',
  };
  const credentials = { email: 'anna@example.com', password: 'una password lunga' };

  it('aggiunge le risposte alla copia cifrata, sulla revisione letta', async () => {
    const stored = await remote();
    const writeProgress = vi.fn<(body: ProgressPut) => Promise<number | null>>(() =>
      Promise.resolve(5),
    );
    const progress = new StudentProgress(
      { readProgress: () => Promise.resolve(stored), writeProgress },
      credentials,
    );
    expect(await progress.append([quizAnswer])).toEqual({ status: 'ok', added: 1 });
    const body = writeProgress.mock.calls[0]?.[0];
    expect(body?.baseRevision).toBe(4);
    if (!body) throw new Error('nessuna scrittura');
    const key = await derivePasswordKey(credentials.email, credentials.password);
    const written = await decryptSnapshot(key, body);
    expect(written?.answers).toEqual([...snapshot.answers, quizAnswer]);
  });

  it('crea la copia se non c’è e riprova se un altro dispositivo scrive', async () => {
    const writeProgress = vi
      .fn<(body: ProgressPut) => Promise<number | null>>(() => Promise.resolve(1))
      .mockResolvedValueOnce(null);
    const progress = new StudentProgress(
      { readProgress: () => Promise.resolve(null), writeProgress },
      credentials,
    );
    expect(await progress.append([quizAnswer])).toEqual({ status: 'ok', added: 1 });
    expect(writeProgress).toHaveBeenCalledTimes(2);
    expect(writeProgress.mock.calls[1]?.[0].baseRevision).toBeNull();
  });

  it('non scrive senza credenziali, con la password cambiata o dopo troppi conflitti', async () => {
    const writeProgress = vi.fn(() => Promise.resolve(null));
    expect(
      await new StudentProgress({ readProgress: vi.fn(), writeProgress }, null).append([
        quizAnswer,
      ]),
    ).toEqual({ status: 'no_credentials' });
    const stored = await remote('vecchia password');
    expect(
      await new StudentProgress(
        { readProgress: () => Promise.resolve(stored), writeProgress },
        credentials,
      ).append([quizAnswer]),
    ).toEqual({ status: 'wrong_password' });
    expect(writeProgress).not.toHaveBeenCalled();
    expect(
      await new StudentProgress(
        { readProgress: () => Promise.resolve(null), writeProgress },
        credentials,
      ).append([quizAnswer]),
    ).toEqual({ status: 'busy' });
    expect(writeProgress).toHaveBeenCalledTimes(3);
  });
});
