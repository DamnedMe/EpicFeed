import { describe, expect, it, vi } from 'vitest';
import { progressResponseSchema } from '@epicfeed/review';
import { accessDeps, logError, record, request, user } from '@/server/generation-test-kit';
import type { ProgressGenerationDeps } from './progress-generation-handler';
import {
  handleReadProgressForClaude,
  handleWriteProgressForClaude,
} from './progress-generation-handler';

vi.mock('server-only', () => ({}));

const stored = {
  kdf: 'pbkdf2-sha256-600000',
  salt: `${'A'.repeat(22)}==`,
  iv: 'B'.repeat(16),
  ciphertext: 'C'.repeat(40),
  revision: 3,
};

function deps(
  get: ProgressGenerationDeps['repository']['get'],
  put: ProgressGenerationDeps['repository']['put'] = () => Promise.resolve(null),
): ProgressGenerationDeps {
  return { ...accessDeps(), repository: { get, put } };
}

const write = (body: unknown, d: ProgressGenerationDeps) =>
  handleWriteProgressForClaude(
    request('/api/generation/progress', { method: 'PUT', body: JSON.stringify(body) }),
    d,
  );

describe('copia dei progressi per Claude Desktop', () => {
  it('restituisce la copia cifrata così com’è e conta la lettura', async () => {
    const response = await handleReadProgressForClaude(
      request('/api/generation/progress'),
      deps(() => Promise.resolve(stored)),
    );
    expect(response.status).toBe(200);
    expect(progressResponseSchema.parse(await response.json())).toEqual(stored);
    expect(record).toHaveBeenCalledWith(user, 'read', null);
  });

  it('401 senza token valido, 404 senza copia, 500 senza dettagli su un errore', async () => {
    const anonymous = await handleReadProgressForClaude(
      request('/api/generation/progress', {}, 'sfg_wrong'),
      deps(() => Promise.resolve(stored)),
    );
    expect(anonymous.status).toBe(401);
    const missing = await handleReadProgressForClaude(
      request('/api/generation/progress'),
      deps(() => Promise.resolve(null)),
    );
    expect(missing.status).toBe(404);
    const failing = await handleReadProgressForClaude(
      request('/api/generation/progress'),
      deps(() => Promise.reject(new Error('db giù'))),
    );
    expect(failing.status).toBe(500);
    expect(logError).toHaveBeenCalled();
  });
});

describe('risposte dei quiz in chat', () => {
  const data = { kdf: stored.kdf, salt: stored.salt, iv: stored.iv, ciphertext: stored.ciphertext };
  const body = { ...data, baseRevision: 3 };

  it('scrive la copia cifrata sul PC se la versione è quella di partenza', async () => {
    const put = vi.fn(() => Promise.resolve(4));
    const response = await write(
      body,
      deps(() => Promise.resolve(stored), put),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 4 });
    expect(put).toHaveBeenCalledWith(user, data, 3);
    expect(record).toHaveBeenCalledWith(user, 'save', null);
  });

  it('409 se è cambiata, 400 se la forma è sbagliata, 401 senza token', async () => {
    const conflict = await write(
      body,
      deps(() => Promise.resolve(stored)),
    );
    expect(conflict.status).toBe(409);
    const invalid = await write(
      { ...body, iv: 'x' },
      deps(() => Promise.resolve(stored)),
    );
    expect(invalid.status).toBe(400);
    const anonymous = await handleWriteProgressForClaude(
      request('/api/generation/progress', { method: 'PUT', body: '{}' }, 'sfg_wrong'),
      deps(() => Promise.resolve(stored)),
    );
    expect(anonymous.status).toBe(401);
    const failing = await write(
      body,
      deps(
        () => Promise.resolve(stored),
        () => Promise.reject(new Error('db giù')),
      ),
    );
    expect(failing.status).toBe(500);
  });
});
