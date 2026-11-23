import { describe, expect, it, vi } from 'vitest';
import type { ImportLessonResult } from '@study-feed/core';
import { DomainError } from '@study-feed/core';
import { MAX_IMPORT_BODY_BYTES } from '@study-feed/contracts';
import { handleImport, type ImportHandlerDeps } from './import-handler';

vi.mock('server-only', () => ({}));

const user = '0a0a0a0a-0000-4000-8000-00000000000a';
const token = `sfi_${'A'.repeat(43)}`;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const body = {
  path: {
    studyProgram: { epicodeId: '5', title: 'EIT' },
    edition: { label: '2024/25' },
    subject: { epicodeId: '177', title: 'DSA', position: 0 },
    chapter: { epicodeId: '66855', title: '3. Trees', position: 2 },
    lesson: { epicodeId: '66863', title: 'Binary trees', position: 1 },
  },
  parts: [
    {
      epicodeId: '103064',
      title: 'Summary',
      position: 6,
      kind: 'reading',
      content: { kind: 'reading', markdown: '# Riassunto' },
    },
  ],
};

const result: ImportLessonResult = {
  lessonId: uuid(1) as ImportLessonResult['lessonId'],
  parts: [
    {
      epicodeId: '103064',
      lessonPartId: uuid(2) as ImportLessonResult['parts'][number]['lessonPartId'],
      contentVersionId: uuid(3) as ImportLessonResult['parts'][number]['contentVersionId'],
      contentHash: 'a'.repeat(64) as ImportLessonResult['parts'][number]['contentHash'],
      newVersion: true,
      newEntitlement: true,
      generationStatus: 'pending',
      subtitles: [],
    },
  ],
};

const record = vi.fn(() => Promise.resolve());
const logError = vi.fn();

function deps(overrides: Partial<ImportHandlerDeps> = {}): ImportHandlerDeps {
  record.mockClear();
  logError.mockClear();
  return {
    verifyToken: (t) => Promise.resolve(t === token ? user : null),
    isAllowed: () => Promise.resolve(true),
    importLesson: () => Promise.resolve(result),
    record,
    logError,
    ...overrides,
  };
}

function request(payload: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/import', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe('POST /api/import', () => {
  it('importa la lezione e registra l’evento', async () => {
    const d = deps();
    const response = await handleImport(request(body), d);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const json = (await response.json()) as { lessonId: string; parts: unknown[] };
    expect(json.lessonId).toBe(uuid(1));
    expect(JSON.stringify(json)).not.toContain('contentHash');
    expect(record).toHaveBeenCalledWith(user, uuid(1), 1);
  });

  it('rifiuta senza token o con token non valido', async () => {
    const noAuth = new Request('https://app.test/api/import', { method: 'POST', body: '{}' });
    expect((await handleImport(noAuth, deps())).status).toBe(401);
    const wrong = await handleImport(request(body, { authorization: 'Bearer sfi_x' }), deps());
    expect(await errorCode(wrong)).toBe('UNAUTHORIZED');
  });

  it('applica il limite di frequenza', async () => {
    const response = await handleImport(
      request(body),
      deps({ isAllowed: () => Promise.resolve(false) }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('600');
  });

  it('rifiuta corpi troppo grandi, anche se Content-Length mente', async () => {
    const big = 'x'.repeat(MAX_IMPORT_BODY_BYTES + 1);
    expect((await handleImport(request(big), deps())).status).toBe(413);
    const declared = request(body, { 'content-length': String(MAX_IMPORT_BODY_BYTES + 10) });
    expect((await handleImport(declared, deps())).status).toBe(413);
  });

  it('rifiuta JSON non valido e campi non previsti', async () => {
    expect(await errorCode(await handleImport(request('{'), deps()))).toBe('INVALID_REQUEST');
    const extra = await handleImport(request({ ...body, campoNonPrevisto: [] }), deps());
    expect(extra.status).toBe(400);
  });

  it('traduce gli errori di dominio e nasconde quelli interni', async () => {
    const invalid = await handleImport(
      request(body),
      deps({
        importLesson: () => Promise.reject(new DomainError('INVALID_CONTENT', 'Il testo è vuoto')),
      }),
    );
    expect(invalid.status).toBe(422);
    const mismatch = await handleImport(
      request(body),
      deps({ importLesson: () => Promise.reject(new DomainError('ENTITLEMENT_MISMATCH', 'x')) }),
    );
    expect(mismatch.status).toBe(403);
    const d = deps({
      importLesson: () => Promise.reject(new Error('connessione persa a db.host')),
    });
    const internal = await handleImport(request(body), d);
    expect(internal.status).toBe(500);
    expect(await internal.text()).not.toContain('db.host');
    expect(logError).toHaveBeenCalled();
  });
});
