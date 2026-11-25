import { describe, expect, it, vi } from 'vitest';
import { authorize } from './generation-api';
import { accessDeps, request, user } from './generation-test-kit';

vi.mock('server-only', () => ({}));

describe('autenticazione e limite di frequenza', () => {
  it('rifiuta senza token o con un token non valido', async () => {
    const result = await authorize(request('/api/generation/lessons', {}, 'x'), accessDeps());
    expect('response' in result && result.response.status).toBe(401);
  });

  it('rifiuta oltre il limite di frequenza', async () => {
    const result = await authorize(request('/api/generation/lessons'), {
      ...accessDeps(),
      isAllowed: () => Promise.resolve(false),
    });
    if (!('response' in result)) throw new Error('atteso un rifiuto');
    expect(result.response.status).toBe(429);
    expect(result.response.headers.get('retry-after')).toBe('600');
  });

  it('con un token valido restituisce l’utente', async () => {
    expect(await authorize(request('/api/generation/lessons'), accessDeps())).toEqual({
      userId: user,
    });
  });
});
