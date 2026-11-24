import { describe, expect, it, vi } from 'vitest';
import type { ContentHash, ExamContent } from '@study-feed/core';
import { DomainError } from '@study-feed/core';
import { examContentResponseSchema } from '@study-feed/contracts';
import type { ExamHandlerDeps } from './exam-handler';
import { handleReadExamContent } from './exam-handler';

vi.mock('server-only', () => ({}));

const user = '0a0a0a0a-0000-4000-8000-00000000000a';
const subjectId = '40000000-0000-4000-8000-000000000001';
const content: ExamContent = {
  subjectId,
  version: 'e'.repeat(64) as ContentHash,
  packs: [],
  bank: {
    subjectId,
    promptVersion: '2026-11-24.1',
    generatedAt: '2026-11-24T10:00:00.000Z',
    exercises: [],
  },
};

function deps(overrides: Partial<ExamHandlerDeps> = {}): ExamHandlerDeps {
  return {
    currentUserId: () => Promise.resolve(user),
    readExamContent: () => Promise.resolve(content),
    logError: vi.fn(),
    ...overrides,
  };
}

const request = (etag?: string) =>
  new Request(`http://localhost/api/exam/subjects/${subjectId}`, {
    headers: etag ? { 'if-none-match': etag } : {},
  });

describe('handleReadExamContent', () => {
  it('restituisce i contenuti con ETag e cache privata', async () => {
    const response = await handleReadExamContent(request(), subjectId, deps());
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(`"${content.version}"`);
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(examContentResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it('risponde 304 se l’app ha già la versione', async () => {
    const response = await handleReadExamContent(
      request(`W/"${content.version}"`),
      subjectId,
      deps(),
    );
    expect(response.status).toBe(304);
  });

  it('senza sessione 401, id non valido o materia non visibile 404', async () => {
    const anonymous = deps({ currentUserId: () => Promise.resolve(null) });
    expect((await handleReadExamContent(request(), subjectId, anonymous)).status).toBe(401);
    expect((await handleReadExamContent(request(), 'nope', deps())).status).toBe(404);
    const hidden = deps({
      readExamContent: () => Promise.reject(new DomainError('NOT_FOUND', 'Materia non trovata')),
    });
    expect((await handleReadExamContent(request(), subjectId, hidden)).status).toBe(404);
  });

  it('errore imprevisto: 500 senza dettagli, registrato', async () => {
    const logError = vi.fn();
    const failing = deps({ readExamContent: () => Promise.reject(new Error('db')), logError });
    const response = await handleReadExamContent(request(), subjectId, failing);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('db');
    expect(logError).toHaveBeenCalledOnce();
  });
});
