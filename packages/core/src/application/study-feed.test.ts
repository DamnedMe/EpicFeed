import { describe, expect, it } from 'vitest';
import type {
  ChapterId,
  ContentHash,
  ContentVersionId,
  LessonFeedDocument,
  LessonId,
  LessonPartId,
  StoredFeedCard,
  UserId,
} from '../domain/index.js';
import { ALIGNMENT_VERSION, DomainError, computeLessonSourcesHash } from '../domain/index.js';
import type { LessonSources } from './generation.js';
import type { StudyFeedLessonRow, StudyFeedSubjectRows } from './study-feed.js';
import { ReadSubjectFeed, RealignLessonFeeds, alignmentVersionOf } from './study-feed.js';

const user = '0a0a0a0a-0000-4000-8000-00000000000a' as UserId;
const lessonA = '10000000-0000-4000-8000-000000000001' as LessonId;
const lessonB = '10000000-0000-4000-8000-000000000002' as LessonId;
const videoPart = '20000000-0000-4000-8000-000000000001' as LessonPartId;
const slidesPart = '20000000-0000-4000-8000-000000000002' as LessonPartId;
const chapter1 = '50000000-0000-4000-8000-000000000001' as ChapterId;
const chapter2 = '50000000-0000-4000-8000-000000000002' as ChapterId;
const bi = (it: string, en: string) => ({ it, en });

const slideCard: StoredFeedCard = {
  id: 'avl',
  kind: 'concept',
  title: bi('Albero AVL', 'AVL tree'),
  keyPoint: bi('Un BST che si ribilancia da solo.', 'A self balancing binary search tree.'),
  body: bi(
    'Il fattore di bilanciamento resta al massimo uno grazie alle rotazioni.',
    'The balance factor stays at most one thanks to a rotation after each insert.',
  ),
  terms: ['AVL tree', 'balance factor'],
  conceptKeys: [],
  sourcePartId: slidesPart,
  origin: 'slides',
  video: null,
};

const documentFor = (lessonId: LessonId, hash: ContentHash, version?: number) =>
  ({
    lessonId,
    sourcesHash: hash,
    promptVersion: '2026-11-21.2',
    generatedAt: '2026-11-22T20:00:00.000Z',
    cards: [slideCard],
    quiz: [],
    concepts: [],
    ...(version === undefined ? {} : { alignmentVersion: version }),
  }) satisfies LessonFeedDocument;

const row = (
  lessonId: LessonId,
  chapterId: ChapterId,
  feed: StudyFeedLessonRow['feed'],
): StudyFeedLessonRow => ({
  lessonId,
  epicodeId: lessonId === lessonA ? '9001' : '9002',
  title: lessonId === lessonA ? 'Binary trees' : 'Heaps',
  position: 0,
  chapterId,
  chapterTitle: chapterId === chapter1 ? '3. Trees' : '4. Graphs',
  chapterPosition: chapterId === chapter1 ? 3 : 4,
  parts: [
    { partId: videoPart, epicodeId: '9101', title: 'AVL', kind: 'video', position: 0 },
    {
      partId: slidesPart,
      epicodeId: 'slides-1',
      title: 'Slide 1',
      kind: 'slides',
      position: 10001,
    },
  ],
  feed,
});

describe('ReadSubjectFeed', () => {
  const rows: StudyFeedSubjectRows = {
    subjectId: '40000000-0000-4000-8000-000000000001',
    epicodeId: '177',
    title: 'Data Structures and Algorithms',
    lessons: [
      row(lessonA, chapter1, {
        feedId: 'f-a',
        document: documentFor(lessonA, 'a'.repeat(64) as ContentHash),
      }),
      row(lessonB, chapter2, null),
    ],
  };

  it('raggruppa per capitolo, costruisce i link al portale e segnala i feed da riallineare', async () => {
    const { feed, outdated } = await new ReadSubjectFeed({
      loadSubjectFeeds: () => Promise.resolve(rows),
    }).execute(user, rows.subjectId);
    expect(feed.chapters.map((chapter) => chapter.title)).toEqual(['3. Trees', '4. Graphs']);
    const first = feed.chapters[0]?.lessons[0];
    expect(first?.portalUrl).toBe('https://learn.epicode.edu.mt/course/177/curriculum/9001');
    expect(first?.parts[0]?.portalUrl).toBe(
      'https://learn.epicode.edu.mt/course/177/curriculum/9101',
    );
    // Le slide dello zip non hanno una pagina sul portale: si apre la lezione.
    expect(first?.parts[1]?.portalUrl).toBe(first?.portalUrl);
    expect(feed.chapters[1]?.lessons[0]?.feed).toBeNull();
    expect(feed.version).toMatch(/^[0-9a-f]{64}$/);
    expect(outdated).toEqual([
      expect.objectContaining({ feedId: 'f-a', lessonId: lessonA, alignmentVersion: 1 }),
    ]);
  });

  it("l'impronta cambia quando un feed viene riallineato", async () => {
    const read = (version?: number) =>
      new ReadSubjectFeed({
        loadSubjectFeeds: () =>
          Promise.resolve({
            ...rows,
            lessons: [
              row(lessonA, chapter1, {
                feedId: 'f-a',
                document: documentFor(lessonA, 'a'.repeat(64) as ContentHash, version),
              }),
            ],
          }),
      }).execute(user, rows.subjectId);
    const before = await read();
    const after = await read(ALIGNMENT_VERSION);
    expect(after.feed.version).not.toBe(before.feed.version);
    expect(after.outdated).toEqual([]);
  });

  it('una materia non visibile allo studente non esiste', async () => {
    const useCase = new ReadSubjectFeed({ loadSubjectFeeds: () => Promise.resolve(null) });
    await expect(useCase.execute(user, rows.subjectId)).rejects.toBeInstanceOf(DomainError);
  });
});

describe('RealignLessonFeeds', () => {
  const lines = [
    ...Array.from({ length: 10 }, (_, i) => `generic remark number ${i} about lists`),
    'an AVL tree is a self balancing binary search tree',
    'the balance factor of every node is at most one',
    'after an insert we perform a rotation to rebalance',
    ...Array.from({ length: 10 }, (_, i) => `closing remark number ${i} about graphs`),
  ];
  const sources: LessonSources = {
    lessonId: lessonA,
    lessonTitle: 'Binary trees',
    chapterTitle: '3. Trees',
    subjectId: '40000000-0000-4000-8000-000000000001',
    subjectTitle: 'DSA',
    glossary: [],
    parts: [
      {
        lessonPartId: videoPart,
        contentVersionId: '30000000-0000-4000-8000-000000000001' as ContentVersionId,
        contentHash: 'c'.repeat(64) as ContentHash,
        title: 'AVL',
        kind: 'video',
        position: 0,
        content: { kind: 'video', summaries: { en: 'Summary' } },
        generationStatus: 'ready',
        subtitles: [
          {
            language: 'en',
            autoGenerated: false,
            cues: lines.map((text, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4000, text })),
          },
        ],
      },
      {
        lessonPartId: slidesPart,
        contentVersionId: '30000000-0000-4000-8000-000000000002' as ContentVersionId,
        contentHash: 'd'.repeat(64) as ContentHash,
        title: 'Slide 1',
        kind: 'slides',
        position: 1,
        content: { kind: 'slides', fileName: 'avl.pdf', pages: [{ number: 1, text: 'AVL' }] },
        generationStatus: 'ready',
        subtitles: [],
      },
    ],
  };

  const setup = () => {
    const updates: { feedId: string; cards: readonly StoredFeedCard[]; version: number }[] = [];
    const useCase = new RealignLessonFeeds(
      { loadLessonSources: () => Promise.resolve(sources) },
      {
        updateFeedAlignment: (feedId, cards, version) => {
          updates.push({ feedId, cards, version });
          return Promise.resolve(true);
        },
      },
    );
    return { updates, useCase };
  };

  it('dà il minuto alle schede dalle slide e alza la versione', async () => {
    const { updates, useCase } = setup();
    const result = await useCase.execute(user, [
      {
        feedId: 'f-a',
        lessonId: lessonA,
        sourcesHash: await computeLessonSourcesHash(sources.parts),
        alignmentVersion: 1,
        cards: [slideCard],
      },
    ]);
    expect(result).toEqual({ updated: 1, alignedCards: 1 });
    expect(updates[0]?.version).toBe(ALIGNMENT_VERSION);
    expect(updates[0]?.cards[0]?.video?.partId).toBe(videoPart);
  });

  it('lascia stare un feed se la lezione è cambiata nel frattempo', async () => {
    const { updates, useCase } = setup();
    const result = await useCase.execute(user, [
      {
        feedId: 'f-a',
        lessonId: lessonA,
        sourcesHash: 'e'.repeat(64) as ContentHash,
        alignmentVersion: 1,
        cards: [slideCard],
      },
    ]);
    expect(result).toEqual({ updated: 0, alignedCards: 0 });
    expect(updates).toEqual([]);
  });

  it('i feed di M2 valgono come versione 1', () => {
    expect(alignmentVersionOf(documentFor(lessonA, 'a'.repeat(64) as ContentHash))).toBe(1);
  });
});
