import { describe, expect, it, vi } from 'vitest';
import type { StoredCorrection } from '@epicfeed/feed';
import { DomainError } from '@epicfeed/shared';
import { correctionsResponseSchema, FeedValidationError } from '@epicfeed/feed';
import type { CorrectionsHandlerDeps } from './corrections-handler';
import {
  handleListCorrections,
  handleReportError,
  handleWithdrawCorrection,
} from './corrections-handler';

vi.mock('server-only', () => ({}));

const user = '0a0a0a0a-0000-4000-8000-00000000000a';
const subjectId = '40000000-0000-4000-8000-000000000001';
const lessonId = '10000000-0000-4000-8000-000000000001';
const id = '60000000-0000-4000-8000-000000000001';
const origin = 'http://localhost';

const body = {
  id,
  subjectId,
  correction: {
    kind: 'text',
    lessonId,
    itemType: 'card',
    itemId: 'stack-rule',
    edits: [{ field: 'keyPoint', language: 'it', original: 'FIFO', corrected: 'LIFO' }],
    reason: 'content',
    snapshot: { id: 'stack-rule' },
  },
} as const;

const stored: StoredCorrection = {
  id,
  subjectId,
  correction: body.correction,
  claudeStatus: 'pending',
  completion: null,
  createdAt: '2026-11-25T10:00:00.000Z',
};

function deps(overrides: Partial<CorrectionsHandlerDeps> = {}): CorrectionsHandlerDeps {
  return {
    currentUserId: () => Promise.resolve(user),
    listCorrections: () => Promise.resolve([stored]),
    reportError: () => Promise.resolve({ correction: stored, created: true }),
    withdrawCorrection: () => Promise.resolve(),
    logError: vi.fn(),
    ...overrides,
  };
}

const post = (payload: unknown, headers: Record<string, string> = { origin }) =>
  new Request(`${origin}/api/corrections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

describe('handleListCorrections', () => {
  it('restituisce le correzioni nella forma del contratto, mai in cache', async () => {
    const response = await handleListCorrections(deps());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(correctionsResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it('senza sessione 401', async () => {
    const response = await handleListCorrections(
      deps({ currentUserId: () => Promise.resolve(null) }),
    );
    expect(response.status).toBe(401);
  });
});

describe('handleReportError', () => {
  it('201 se nuova, 200 se reinviata', async () => {
    expect((await handleReportError(post(body), deps())).status).toBe(201);
    const again = deps({
      reportError: () => Promise.resolve({ correction: stored, created: false }),
    });
    expect((await handleReportError(post(body), again)).status).toBe(200);
  });

  it('rifiuta altre origini, forma sbagliata e corpo non JSON', async () => {
    expect(
      (await handleReportError(post(body, { origin: 'https://evil.test' }), deps())).status,
    ).toBe(403);
    expect((await handleReportError(post({ ...body, id: 'x' }), deps())).status).toBe(400);
    const notJson = new Request(`${origin}/api/corrections`, {
      method: 'POST',
      headers: { origin },
      body: '{',
    });
    expect((await handleReportError(notJson, deps())).status).toBe(400);
  });

  it('traduce gli errori del dominio', async () => {
    const failing = (error: Error) =>
      handleReportError(post(body), deps({ reportError: () => Promise.reject(error) }));
    expect((await failing(new DomainError('NOT_FOUND', 'x'))).status).toBe(404);
    expect((await failing(new DomainError('LIMIT_REACHED', 'x'))).status).toBe(409);
    expect((await failing(new DomainError('ALREADY_DONE', 'x'))).status).toBe(409);
    expect(
      (await failing(new FeedValidationError([{ path: 'edits.0', message: 'x' }]))).status,
    ).toBe(400);
    expect((await failing(new Error('db'))).status).toBe(500);
  });
});

describe('handleWithdrawCorrection', () => {
  const del = (headers: Record<string, string> = { origin }) =>
    new Request(`${origin}/api/corrections/${id}`, { method: 'DELETE', headers });

  it('204 se annullata, 404 se non c’è o l’id non è valido', async () => {
    expect((await handleWithdrawCorrection(del(), id, deps())).status).toBe(204);
    expect((await handleWithdrawCorrection(del(), 'x', deps())).status).toBe(404);
    const missing = deps({
      withdrawCorrection: () => Promise.reject(new DomainError('NOT_FOUND', 'x')),
    });
    expect((await handleWithdrawCorrection(del(), id, missing)).status).toBe(404);
    expect((await handleWithdrawCorrection(del({}), id, deps())).status).toBe(403);
  });
});
