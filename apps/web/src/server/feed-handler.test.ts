import { describe, expect, it, vi } from 'vitest';
import type {
  ChapterId,
  ContentHash,
  LessonId,
  LessonPartId,
  ReadSubjectFeedResult,
  UserId,
} from '@epicfeed/core';
import { DomainError } from '@epicfeed/core';
import { studySubjectsResponseSchema, subjectFeedResponseSchema } from '@epicfeed/contracts';
import { handleListSubjects, handleReadSubjectFeed, type FeedHandlerDeps } from './feed-handler';
import { loadFeedPreview } from './feed-preview';

vi.mock('server-only', () => ({}));

const user = '0a0a0a0a-0000-4000-8000-00000000000a';
const subjectId = '40000000-0000-4000-8000-000000000001';
const lessonId = '10000000-0000-4000-8000-000000000001' as LessonId;
const partId = '20000000-0000-4000-8000-000000000001' as LessonPartId;
const version = 'f'.repeat(64) as ContentHash;
const bi = (it: string, en: string) => ({ it, en });

const result = (outdated = false): ReadSubjectFeedResult => {
  const cards = [
    {
      id: 'avl',
      kind: 'concept' as const,
      title: bi('Albero AVL', 'AVL tree'),
      keyPoint: bi('Si ribilancia.', 'It rebalances.'),
      body: bi('Rotazioni.', 'Rotations.'),
      terms: ['AVL tree'],
      conceptKeys: [],
      sourcePartId: partId,
      origin: 'summary' as const,
      video: { startMs: 1000, endMs: 31000, confidence: 0.5, language: 'it', partId },
    },
  ];
  return {
    feed: {
      subjectId,
      title: 'DSA',
      version,
      chapters: [
        {
          chapterId: '50000000-0000-4000-8000-000000000001' as ChapterId,
          title: '3. Trees',
          lessons: [
            {
              lessonId,
              title: 'Binary trees',
              position: 1,
              portalUrl: 'https://learn.epicode.edu.mt/course/177/curriculum/66863',
              parts: [
                {
                  partId,
                  epicodeId: '66864',
                  title: 'AVL',
                  kind: 'video',
                  position: 0,
                  portalUrl: 'https://learn.epicode.edu.mt/course/177/curriculum/66864',
                },
              ],
              feed: {
                lessonId,
                sourcesHash: 'a'.repeat(64) as ContentHash,
                promptVersion: '2026-11-21.2',
                generatedAt: '2026-11-22T20:00:00.000Z',
                cards,
                quiz: [],
                concepts: [],
                alignmentVersion: 2,
              },
            },
          ],
        },
      ],
    },
    outdated: outdated
      ? [
          {
            feedId: 'f',
            lessonId,
            sourcesHash: 'a'.repeat(64) as ContentHash,
            alignmentVersion: 1,
            cards,
          },
        ]
      : [],
  };
};

function deps(overrides: Partial<FeedHandlerDeps> = {}): FeedHandlerDeps {
  return {
    currentUserId: () => Promise.resolve(user),
    listSubjects: () =>
      Promise.resolve([
        { subjectId, title: 'DSA', editionLabel: '2024/25', lessons: 31, lessonsWithFeed: 31 },
      ]),
    readSubjectFeed: () => Promise.resolve(result()),
    scheduleRealign: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  };
}

const request = (headers: Record<string, string> = {}) =>
  new Request(`https://app.test/api/feed/subjects/${subjectId}`, { headers });

describe('handleListSubjects', () => {
  it('elenca le materie nel formato del contratto', async () => {
    const response = await handleListSubjects(deps());
    expect(response.status).toBe(200);
    expect(studySubjectsResponseSchema.parse(await response.json()).subjects).toHaveLength(1);
  });

  it('senza sessione risponde 401', async () => {
    const response = await handleListSubjects(deps({ currentUserId: () => Promise.resolve(null) }));
    expect(response.status).toBe(401);
  });
});

describe('handleReadSubjectFeed', () => {
  it('restituisce la materia con ETag e senza id del portale', async () => {
    const response = await handleReadSubjectFeed(request(), subjectId, deps());
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(`"${version}"`);
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    const body = subjectFeedResponseSchema.parse(await response.json());
    expect(body.chapters[0]?.lessons[0]?.parts[0]).not.toHaveProperty('epicodeId');
    expect(body.chapters[0]?.lessons[0]?.feed?.cards[0]?.video?.partId).toBe(partId);
  });

  it('risponde 304 se l’app ha già la versione corrente', async () => {
    const response = await handleReadSubjectFeed(
      request({ 'if-none-match': `W/"${version}"` }),
      subjectId,
      deps(),
    );
    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
  });

  it('programma il riallineamento dei feed vecchi senza farlo aspettare', async () => {
    const scheduleRealign = vi.fn();
    await handleReadSubjectFeed(
      request(),
      subjectId,
      deps({ readSubjectFeed: () => Promise.resolve(result(true)), scheduleRealign }),
    );
    expect(scheduleRealign).toHaveBeenCalledWith(user as UserId, [
      expect.objectContaining({ feedId: 'f' }),
    ]);
  });

  it('id non valido o materia non visibile: 404; errore imprevisto: 500 senza dettagli', async () => {
    expect((await handleReadSubjectFeed(request(), 'x', deps())).status).toBe(404);
    const hidden = deps({
      readSubjectFeed: () => Promise.reject(new DomainError('NOT_FOUND', 'no')),
    });
    expect((await handleReadSubjectFeed(request(), subjectId, hidden)).status).toBe(404);
    const logError = vi.fn();
    const broken = deps({ readSubjectFeed: () => Promise.reject(new Error('db')), logError });
    const response = await handleReadSubjectFeed(request(), subjectId, broken);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('db');
    expect(logError).toHaveBeenCalled();
  });
});

describe('loadFeedPreview', () => {
  const userId = user as UserId;

  it('disegna la prima lezione senza id del portale', async () => {
    const preview = await loadFeedPreview(userId, deps());
    expect(preview?.version).toBe(`anteprima:${version}`);
    expect(preview?.chapters[0]?.lessons[0]?.feed?.cards).toHaveLength(1);
    expect(preview?.chapters[0]?.lessons[0]?.parts[0]).not.toHaveProperty('epicodeId');
  });

  it('senza materie o con un errore lascia caricare il client', async () => {
    expect(await loadFeedPreview(userId, deps({ listSubjects: () => Promise.resolve([]) }))).toBe(
      null,
    );
    const logError = vi.fn();
    const failing = deps({ readSubjectFeed: () => Promise.reject(new Error('db')), logError });
    expect(await loadFeedPreview(userId, failing)).toBeNull();
    expect(logError).toHaveBeenCalledOnce();
  });
});
