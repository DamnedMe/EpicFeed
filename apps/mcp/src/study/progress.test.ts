import type { ProgressSnapshot } from '@epicfeed/review';
import { derivePasswordKey, encryptSnapshot } from '@epicfeed/review/crypto';
import { describe, expect, it, vi } from 'vitest';
import { ProgressReader, progressProblem } from './progress.js';

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
    const reader = new ProgressReader(
      { readProgress },
      { email: ' Anna@Example.com ', password: 'una password lunga' },
    );
    expect(await reader.read()).toEqual({ status: 'ok', snapshot });
    expect(await reader.read()).toEqual({ status: 'ok', snapshot });
    expect(readProgress).toHaveBeenCalledTimes(2);
  });

  it('dice perché non legge: credenziali mancanti, nessuna copia, password cambiata', async () => {
    const stored = await remote('vecchia password');
    expect(await new ProgressReader({ readProgress: vi.fn() }, null).read()).toEqual({
      status: 'no_credentials',
    });
    const none = new ProgressReader(
      { readProgress: () => Promise.resolve(null) },
      { email: 'anna@example.com', password: 'x' },
    );
    expect(await none.read()).toEqual({ status: 'no_copy' });
    const wrong = new ProgressReader(
      { readProgress: () => Promise.resolve(stored) },
      { email: 'anna@example.com', password: 'nuova password' },
    );
    expect(await wrong.read()).toEqual({ status: 'wrong_password' });
    for (const status of ['no_credentials', 'no_copy', 'wrong_password'] as const) {
      expect(progressProblem(status).length).toBeGreaterThan(20);
    }
  });
});
