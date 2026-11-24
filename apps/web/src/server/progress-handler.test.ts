import { describe, expect, it, vi } from 'vitest';
import type { EncryptedProgressRepository, StoredProgress } from '@epicfeed/core';
import { progressResponseSchema } from '@epicfeed/contracts';
import {
  handleReadProgress,
  handleWriteProgress,
  MAX_PROGRESS_BODY,
  type ProgressHandlerDeps,
} from './progress-handler';

vi.mock('server-only', () => ({}));

const user = '0a0a0a0a-0000-4000-8000-00000000000a';
const URL_ = 'https://epicfeed.test/api/progress';
const data = {
  kdf: 'pbkdf2-sha256-600000',
  salt: `${'A'.repeat(22)}==`,
  iv: 'B'.repeat(16),
  ciphertext: 'C'.repeat(40),
};

/** Repository in memoria con la stessa concorrenza ottimistica di Postgres. */
function memoryRepo(initial: StoredProgress | null = null): EncryptedProgressRepository {
  let stored = initial;
  return {
    get: () => Promise.resolve(stored),
    put: (_user, next, base) => {
      if ((stored?.revision ?? null) !== base) return Promise.resolve(null);
      stored = { ...next, revision: (stored?.revision ?? 0) + 1 };
      return Promise.resolve(stored.revision);
    },
  };
}

function deps(over: Partial<ProgressHandlerDeps> = {}): ProgressHandlerDeps {
  return {
    currentUserId: () => Promise.resolve(user),
    repository: memoryRepo(),
    logError: vi.fn(),
    ...over,
  };
}

const put = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: 'PUT',
    headers: { origin: 'https://epicfeed.test', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('GET /api/progress', () => {
  it('chiede di accedere senza sessione', async () => {
    const response = await handleReadProgress(deps({ currentUserId: () => Promise.resolve(null) }));
    expect(response.status).toBe(401);
  });

  it('risponde 404 senza copia e la copia quando c’è', async () => {
    expect((await handleReadProgress(deps())).status).toBe(404);
    const response = await handleReadProgress(
      deps({ repository: memoryRepo({ ...data, revision: 3 }) }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(progressResponseSchema.parse(await response.json()).revision).toBe(3);
  });

  it('nasconde gli errori interni', async () => {
    const logError = vi.fn();
    const repository = { ...memoryRepo(), get: () => Promise.reject(new Error('db giù')) };
    const response = await handleReadProgress(deps({ repository, logError }));
    expect(response.status).toBe(500);
    expect(logError).toHaveBeenCalled();
  });
});

describe('PUT /api/progress', () => {
  it('crea e poi aggiorna la copia, 409 se la versione è vecchia', async () => {
    const d = deps();
    const first = await handleWriteProgress(put({ ...data, baseRevision: null }), d);
    expect(await first.json()).toEqual({ revision: 1 });
    const second = await handleWriteProgress(put({ ...data, baseRevision: 1 }), d);
    expect(await second.json()).toEqual({ revision: 2 });
    const stale = await handleWriteProgress(put({ ...data, baseRevision: 1 }), d);
    expect(stale.status).toBe(409);
  });

  it('rifiuta richieste da altre origini o senza sessione', async () => {
    const foreign = put({ ...data, baseRevision: null }, { origin: 'https://evil.test' });
    expect((await handleWriteProgress(foreign, deps())).status).toBe(403);
    const anonymous = deps({ currentUserId: () => Promise.resolve(null) });
    expect(
      (await handleWriteProgress(put({ ...data, baseRevision: null }), anonymous)).status,
    ).toBe(401);
  });

  it('rifiuta corpi troppo grandi, non JSON o con forma sbagliata', async () => {
    const big = put(
      { ...data, baseRevision: null },
      {
        'content-length': String(MAX_PROGRESS_BODY + 1),
      },
    );
    expect((await handleWriteProgress(big, deps())).status).toBe(413);
    expect((await handleWriteProgress(put('{nope'), deps())).status).toBe(400);
    expect((await handleWriteProgress(put({ ...data }), deps())).status).toBe(400);
  });

  it('nasconde gli errori interni', async () => {
    const repository = { ...memoryRepo(), put: () => Promise.reject(new Error('db giù')) };
    const response = await handleWriteProgress(
      put({ ...data, baseRevision: null }),
      deps({ repository }),
    );
    expect(response.status).toBe(500);
  });
});
