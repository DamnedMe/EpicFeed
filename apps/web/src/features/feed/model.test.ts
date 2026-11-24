import { describe, expect, it } from 'vitest';
import type { FeedLesson, SubjectFeed } from './model';
import {
  buildEntries,
  chapterIndex,
  entryKey,
  feedPreview,
  formatMinute,
  PREVIEW_VERSION_PREFIX,
  resumeIndex,
} from './model';

const bi = (it: string, en: string) => ({ it, en });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const portal = (n: number) => `https://learn.epicode.edu.mt/course/177/curriculum/${n}`;

function card(cardId: string, part: string, video: { partId?: string; startMs: number } | null) {
  return {
    id: cardId,
    kind: 'concept' as const,
    title: bi(`Titolo ${cardId}`, `Title ${cardId}`),
    keyPoint: bi('Frase chiave.', 'Key point.'),
    body: bi('Spiegazione.', 'Explanation.'),
    terms: [],
    conceptKeys: ['c'],
    sourcePartId: part,
    origin: 'slides' as const,
    video: video ? { endMs: video.startMs + 5000, confidence: 0.9, ...video } : null,
  };
}

function lesson(n: number, withFeed: boolean): FeedLesson {
  const video = id(n * 10 + 1);
  const slides = id(n * 10 + 2);
  return {
    lessonId: id(n),
    title: `Lezione ${n}`,
    position: n,
    portalUrl: portal(n),
    parts: [
      {
        partId: video,
        title: `Video ${n}`,
        kind: 'video',
        position: 0,
        portalUrl: portal(n * 10 + 1),
      },
      {
        partId: slides,
        title: `Slide ${n}`,
        kind: 'slides',
        position: 1,
        portalUrl: portal(n * 10 + 2),
      },
    ],
    feed: withFeed
      ? ({
          lessonId: id(n),
          sourcesHash: 'a'.repeat(64),
          promptVersion: 'p',
          generatedAt: '2026-11-22T10:00:00.000Z',
          alignmentVersion: 2,
          cards: [
            card('a', slides, { partId: video, startMs: 134_000 }),
            card('b', video, { startMs: 5_000 }),
            card('c', slides, null),
          ],
          quiz: [
            {
              id: 'q1',
              kind: 'true_false',
              question: bi('Vero?', 'True?'),
              answer: true,
              explanation: bi('Sì.', 'Yes.'),
              conceptKey: 'c',
              difficulty: 1,
            },
          ],
          concepts: [],
        } as unknown as FeedLesson['feed'])
      : null,
  };
}

const feed: SubjectFeed = {
  subjectId: id(900),
  title: 'DSA',
  version: 'f'.repeat(64),
  chapters: [
    { chapterId: id(800), title: '1. Intro', lessons: [lesson(1, true), lesson(2, false)] },
    { chapterId: id(801), title: '2. Trees', lessons: [lesson(3, true)] },
    { chapterId: id(802), title: '3. Graphs', lessons: [lesson(4, false)] },
  ],
};

describe('buildEntries', () => {
  const entries = buildEntries(feed);

  it('mette in ordine schede e domande delle lezioni con un feed', () => {
    expect(entries.map((entry) => `${entry.lessonTitle}:${entry.type}`)).toEqual([
      'Lezione 1:card',
      'Lezione 1:card',
      'Lezione 1:card',
      'Lezione 1:quiz',
      'Lezione 3:card',
      'Lezione 3:card',
      'Lezione 3:card',
      'Lezione 3:quiz',
    ]);
    expect(entries[4]?.chapterIndex).toBe(1);
    expect(entries[0]?.key).toBe(entryKey(id(1), 'card', 'a'));
  });

  it('collega fonte e parte video del minuto, anche per i feed di M2 senza parte', () => {
    const [fromSlides, fromVideo, unaligned] = entries;
    if (fromSlides?.type !== 'card' || fromVideo?.type !== 'card' || unaligned?.type !== 'card') {
      throw new Error('attese tre schede');
    }
    expect(fromSlides.source?.title).toBe('Slide 1');
    expect(fromSlides.video).toEqual({
      title: 'Video 1',
      kind: 'video',
      portalUrl: portal(11),
      startMs: 134_000,
    });
    expect(fromVideo.video?.portalUrl).toBe(portal(11));
    expect(unaligned.video).toBeNull();
  });
});

describe('chapterIndex e resumeIndex', () => {
  const entries = buildEntries(feed);

  it('indica dove inizia ogni capitolo e ogni lezione', () => {
    const index = chapterIndex(feed, entries);
    expect(index.map((chapter) => chapter.start)).toEqual([0, 4, null]);
    expect(index[0]?.lessons).toEqual([
      { lessonId: id(1), title: 'Lezione 1', start: 0, cards: 3 },
      { lessonId: id(2), title: 'Lezione 2', start: null, cards: 0 },
    ]);
  });

  it('riprende dall’elemento salvato, o dall’inizio', () => {
    expect(resumeIndex(entries, entries[5]?.key ?? null)).toBe(5);
    expect(resumeIndex(entries, 'sparita')).toBe(0);
    expect(resumeIndex(entries, null)).toBe(0);
  });
});

describe('formatMinute', () => {
  it('scrive minuti e ore', () => {
    expect(formatMinute(134_000)).toBe('2:14');
    expect(formatMinute(-5)).toBe('0:00');
    expect(formatMinute(3_725_000)).toBe('1:02:05');
  });
});

describe('feedPreview', () => {
  it('tiene tutti i titoli ma il feed solo della prima lezione pronta', () => {
    const preview = feedPreview(feed);
    expect(preview?.version).toBe(`${PREVIEW_VERSION_PREFIX}${feed.version}`);
    const lessons = preview?.chapters.flatMap((chapter) => chapter.lessons) ?? [];
    expect(lessons).toHaveLength(4);
    expect(lessons.map((lesson) => lesson.feed !== null)).toEqual([true, false, false, false]);
    expect(lessons[0]?.feed).toBe(feed.chapters[0]?.lessons[0]?.feed);
  });

  it('senza lezioni pronte non c’è anteprima', () => {
    const empty: SubjectFeed = {
      ...feed,
      chapters: [{ chapterId: id(803), title: '4. Heaps', lessons: [lesson(5, false)] }],
    };
    expect(feedPreview(empty)).toBeNull();
  });
});
