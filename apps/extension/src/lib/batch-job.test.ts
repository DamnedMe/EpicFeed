import { describe, expect, it, vi } from 'vitest';
import type { ImportLessonRequest } from '@study-feed/contracts';
import { runBatchJob, type BatchJobDeps } from './batch-job';
import type { BatchPlan, ImportStatus, LessonPreview, ReadActivityResponse } from './messages';

const connection = {
  token: `sfi_${'C'.repeat(43)}`,
  expiresAt: '2099-01-01T00:00:00Z',
  apiBaseUrl: 'https://app.test',
};

function preview(lessonId: string): LessonPreview {
  const request: ImportLessonRequest = {
    path: {
      studyProgram: { epicodeId: '5', title: 'EIT' },
      edition: { label: '2025/26' },
      subject: { epicodeId: '177', title: 'DSA', position: 0 },
      chapter: { epicodeId: '66855', title: '3. Trees', position: 1003 },
      lesson: { epicodeId: lessonId, title: `Lezione ${lessonId}`, position: 1 },
    },
    parts: [
      {
        epicodeId: `${lessonId}1`,
        title: 'Riassunto',
        position: 0,
        kind: 'reading',
        content: { kind: 'reading', markdown: '# Testo' },
      },
    ],
  };
  return { request, videos: [], skipped: 0 };
}

const plan: BatchPlan = {
  scope: 'course',
  title: 'DSA',
  courseId: '177',
  lessons: [
    { id: '1', title: 'Uno', chapterId: 'a' },
    { id: '2', title: 'Due', chapterId: 'a' },
    { id: '3', title: 'Tre', chapterId: 'b' },
  ],
};

const pacing = {
  betweenParts: [1, 1],
  betweenVideos: [2, 2],
  betweenLessons: [10, 10],
  betweenChapters: [100, 100],
} as const;

function setup(overrides: Partial<BatchJobDeps> = {}) {
  const statuses: ImportStatus[] = [];
  const pauses: number[] = [];
  const marked: string[] = [];
  const deps: BatchJobDeps = {
    readLesson: (id) => Promise.resolve({ ok: true, preview: preview(id) }),
    isCancelled: () => false,
    markImported: (id) => {
      marked.push(id);
      return Promise.resolve();
    },
    now: () => 0,
    random: () => 0,
    pacing,
    loadTracks: () => Promise.resolve(null),
    fetchText: () => Promise.reject(new Error('mai')),
    pause: (ms) => {
      pauses.push(ms);
      return Promise.resolve();
    },
    report: (status) => {
      statuses.push(status);
      return Promise.resolve();
    },
    fetch: () =>
      Promise.resolve(
        Response.json({
          lessonId: '00000000-0000-4000-8000-000000000001',
          parts: [
            {
              epicodeId: 'x',
              lessonPartId: '00000000-0000-4000-8000-000000000002',
              contentVersionId: '00000000-0000-4000-8000-000000000003',
              newVersion: true,
              newEntitlement: true,
              generationStatus: 'pending',
              subtitles: [],
            },
          ],
        }),
      ),
    ...overrides,
  };
  return { deps, statuses, pauses, marked };
}

describe('runBatchJob', () => {
  it('importa le lezioni una alla volta con la pausa giusta e ricorda quelle importate', async () => {
    const { deps, statuses, pauses, marked } = setup();
    const final = await runBatchJob(plan, connection, deps);
    expect(final).toMatchObject({
      phase: 'batch-done',
      total: 3,
      imported: 3,
      freshLessons: 3,
      failed: [],
      stopped: null,
    });
    // Stesso capitolo: pausa breve; cambio di capitolo: pausa lunga.
    expect(pauses).toEqual([10, 100]);
    expect(marked).toEqual(['1', '2', '3']);
    expect(statuses.filter((s) => s.phase === 'reading').length).toBe(3);
    expect(statuses.find((s) => s.phase === 'sending')).toMatchObject({
      progress: { scope: 'course', index: 0, total: 3, lessonTitle: 'Uno' },
    });
  });

  it('conta le lezioni vuote e prosegue dopo un errore non grave', async () => {
    const { deps } = setup({
      readLesson: (id): Promise<ReadActivityResponse> =>
        Promise.resolve(
          id === '1'
            ? { ok: true, preview: null }
            : id === '2'
              ? { ok: false, fatal: false, error: 'Rifiutata' }
              : { ok: true, preview: preview(id) },
        ),
    });
    expect(await runBatchJob(plan, connection, deps)).toMatchObject({
      imported: 1,
      empty: 1,
      failed: [{ title: 'Due', message: 'Rifiutata' }],
      stopped: null,
    });
  });

  it('si ferma su un errore grave della lettura', async () => {
    const readLesson = vi.fn((): Promise<ReadActivityResponse> =>
      Promise.resolve({ ok: false, fatal: true, error: 'Scheda chiusa' }),
    );
    const { deps } = setup({ readLesson });
    expect(await runBatchJob(plan, connection, deps)).toMatchObject({
      imported: 0,
      stopped: 'Scheda chiusa',
    });
    expect(readLesson).toHaveBeenCalledTimes(1);
  });

  it('si ferma se il collegamento con EpicFeed non vale più', async () => {
    const { deps } = setup({
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'UNAUTHORIZED', message: 'Ricollega l’estensione' } },
            { status: 401 },
          ),
        ),
    });
    expect(await runBatchJob(plan, connection, deps)).toMatchObject({
      imported: 0,
      stopped: 'Ricollega l’estensione',
    });
  });

  it('si ferma dopo tre errori di fila', async () => {
    const long: BatchPlan = {
      ...plan,
      lessons: ['1', '2', '3', '4'].map((id) => ({ id, title: id, chapterId: 'a' })),
    };
    const readLesson = vi.fn((): Promise<ReadActivityResponse> =>
      Promise.resolve({ ok: false, fatal: false, error: 'Errore' }),
    );
    const { deps } = setup({ readLesson });
    expect(await runBatchJob(long, connection, deps)).toMatchObject({
      stopped: expect.stringContaining('Troppi errori') as string,
    });
    expect(readLesson).toHaveBeenCalledTimes(3);
  });

  it('si interrompe su richiesta tra una lezione e l’altra', async () => {
    let cancelled = false;
    const { deps, marked } = setup({
      isCancelled: () => cancelled,
      markImported: () => {
        cancelled = true;
        return Promise.resolve();
      },
    });
    expect(await runBatchJob(plan, connection, deps)).toMatchObject({
      imported: 1,
      stopped: 'Import interrotto.',
    });
    expect(marked).toEqual([]);
  });

  it('attende il limite orario di EpicFeed e ritenta', async () => {
    let calls = 0;
    const base = setup();
    const { deps, statuses } = setup({
      fetch: (input, init) => {
        calls += 1;
        if (calls === 2) {
          return Promise.resolve(
            Response.json(
              { error: { code: 'RATE_LIMITED', message: 'Troppi import' } },
              { status: 429, headers: { 'retry-after': '60' } },
            ),
          );
        }
        return base.deps.fetch(input, init);
      },
    });
    expect(await runBatchJob(plan, connection, deps)).toMatchObject({ imported: 3, stopped: null });
    expect(statuses.find((s) => s.phase === 'pause' && s.reason === 'rate-limit')).toMatchObject({
      until: 60_000,
    });
  });
});
