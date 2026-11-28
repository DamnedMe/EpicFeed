import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@epicfeed/shared';
import { FeedValidationError } from '@epicfeed/feed';
import { accessDeps, errorOf, record, request, user } from '@/server/generation-test-kit';
import type { CorrectionGenerationDeps } from './correction-generation-handler';
import {
  handleCompleteCorrection,
  handleListPendingCorrections,
  handleReportErrorFromClaude,
} from './correction-generation-handler';

vi.mock('server-only', () => ({}));

const id = '60000000-0000-4000-8000-000000000001';
const url = `/api/generation/corrections/${id}/completion`;
const completion = {
  outcome: 'done',
  edits: [{ field: 'keyPoint', language: 'en', original: 'FIFO', corrected: 'LIFO' }],
};

function deps(overrides: Partial<CorrectionGenerationDeps> = {}): CorrectionGenerationDeps {
  return {
    ...accessDeps(),
    listPendingCorrections: () => Promise.resolve([]),
    completeCorrection: () => Promise.resolve(),
    reportError: (_user, input) =>
      Promise.resolve({
        correction: {
          id: input.id,
          subjectId: input.subjectId,
          correction: input.correction,
          claudeStatus: 'not_needed',
          completion: null,
          createdAt: '2026-11-28T10:00:00.000Z',
        },
        created: true,
      }),
    ...overrides,
  };
}

const post = (payload: unknown, rawId = id, d = deps()) =>
  handleCompleteCorrection(
    request(url, { method: 'POST', body: JSON.stringify(payload) }),
    rawId,
    d,
  );

describe('API delle correzioni per Claude Desktop', () => {
  it('elenca le correzioni in attesa con il token e conta la lettura', async () => {
    const response = await handleListPendingCorrections(
      request('/api/generation/corrections'),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ corrections: [] });
    expect(record).toHaveBeenCalledWith(user, 'read', null);
    const anonymous = await handleListPendingCorrections(
      request('/api/generation/corrections', {}, 'sfg_wrong'),
      deps(),
    );
    expect(anonymous.status).toBe(401);
  });

  it('salva il lavoro di Claude e rifiuta forma e id non validi', async () => {
    expect((await post({ completion })).status).toBe(201);
    expect((await post({ completion: { outcome: 'done', edits: [] } })).status).toBe(422);
    expect((await post({ completion }, 'x')).status).toBe(404);
  });

  it('409 se non è più in attesa, 422 con i problemi del dominio', async () => {
    const failing = (error: Error) =>
      post({ completion }, id, deps({ completeCorrection: () => Promise.reject(error) }));
    expect((await failing(new DomainError('ALREADY_DONE', 'x'))).status).toBe(409);
    expect((await failing(new DomainError('NOT_FOUND', 'x'))).status).toBe(404);
    const invalid = await failing(
      new FeedValidationError([{ path: 'edits', message: 'Manca l’inglese' }], 'La correzione'),
    );
    expect(invalid.status).toBe(422);
    expect((await errorOf(invalid)).issues?.[0]?.path).toBe('edits');
  });
});

describe('correzione chiesta a Claude in chat', () => {
  const subjectId = '40000000-0000-4000-8000-000000000001';
  const report = {
    id: '60000000-0000-4000-8000-0000000000AA',
    subjectId,
    correction: {
      kind: 'text',
      lessonId: '10000000-0000-4000-8000-0000000000BB',
      itemType: 'card',
      itemId: 'heap',
      reason: 'content',
      edits: [
        { field: 'keyPoint', language: 'it', original: 'O(n)', corrected: 'O(log n)' },
        { field: 'keyPoint', language: 'en', original: 'O(n)', corrected: 'O(log n)' },
      ],
      snapshot: { id: 'heap' },
    },
  };
  const send = (payload: unknown, d = deps()) =>
    handleReportErrorFromClaude(
      request('/api/generation/corrections', { method: 'POST', body: JSON.stringify(payload) }),
      d,
    );

  it('salva la correzione dello studente con gli id in minuscolo', async () => {
    const base = deps();
    const reportError = vi.fn(
      (
        userId: Parameters<typeof base.reportError>[0],
        input: Parameters<typeof base.reportError>[1],
      ) => base.reportError(userId, input),
    );
    const response = await send(report, deps({ reportError }));
    expect(response.status).toBe(201);
    expect(reportError).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        id: report.id.toLowerCase(),
        correction: expect.objectContaining({
          lessonId: report.correction.lessonId.toLowerCase(),
        }) as unknown,
      }),
    );
    expect(record).toHaveBeenCalledWith(user, 'save', null);
  });

  it('rifiuta forma, token e lezioni non valide, e il limite raggiunto', async () => {
    expect((await send({ ...report, id: 'x' })).status).toBe(422);
    const anonymous = await handleReportErrorFromClaude(
      request('/api/generation/corrections', { method: 'POST', body: '{}' }, 'sfg_wrong'),
      deps(),
    );
    expect(anonymous.status).toBe(401);
    const failing = (error: Error) =>
      send(report, deps({ reportError: () => Promise.reject(error) }));
    expect((await failing(new DomainError('NOT_FOUND', 'x'))).status).toBe(404);
    expect((await failing(new DomainError('LIMIT_REACHED', 'x'))).status).toBe(409);
    expect((await failing(new DomainError('ALREADY_DONE', 'x'))).status).toBe(409);
  });
});
