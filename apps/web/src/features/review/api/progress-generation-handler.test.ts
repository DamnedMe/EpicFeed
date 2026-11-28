import { describe, expect, it, vi } from 'vitest';
import { progressResponseSchema } from '@epicfeed/review';
import { accessDeps, logError, record, request, user } from '@/server/generation-test-kit';
import type { ProgressGenerationDeps } from './progress-generation-handler';
import { handleReadProgressForClaude } from './progress-generation-handler';

vi.mock('server-only', () => ({}));

const stored = {
  kdf: 'pbkdf2-sha256-600000',
  salt: `${'A'.repeat(22)}==`,
  iv: 'B'.repeat(16),
  ciphertext: 'C'.repeat(40),
  revision: 3,
};

function deps(get: ProgressGenerationDeps['repository']['get']): ProgressGenerationDeps {
  return { ...accessDeps(), repository: { get } };
}

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
