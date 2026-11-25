import { describe, expect, it } from 'vitest';
import type { StoredCorrection } from '@epicfeed/feed';
import type { SubjectFeed } from '../model';
import { correctSubject, correctedKey } from './apply';

const bi = <T>(it: T, en: T) => ({ it, en });
const subjectId = '40000000-0000-4000-8000-000000000001';
const lessonId = '10000000-0000-4000-8000-000000000001';

const feed: SubjectFeed = {
  subjectId,
  title: 'DSA',
  version: 'a'.repeat(64),
  chapters: [
    {
      chapterId: '30000000-0000-4000-8000-000000000001',
      title: 'Pile',
      lessons: [
        {
          lessonId,
          title: 'Pile e code',
          position: 0,
          portalUrl: 'https://learn.epicode.edu.mt/x',
          parts: [],
          feed: {
            lessonId,
            sourcesHash: 'b'.repeat(64),
            promptVersion: '2026-11-21.1',
            generatedAt: '2026-11-21T10:00:00.000Z',
            cards: [
              {
                id: 'stack-rule',
                kind: 'concept',
                title: bi('Pile', 'Stacks'),
                keyPoint: bi('Una pila è FIFO.', 'A stack is FIFO.'),
                body: bi('Spiegazione.', 'Explanation.'),
                terms: [],
                conceptKeys: ['stack'] as never,
                sourcePartId: '20000000-0000-4000-8000-000000000001' as never,
                origin: 'summary',
                video: null,
              },
            ],
            quiz: [],
            concepts: [],
          },
        },
        {
          lessonId: '10000000-0000-4000-8000-000000000002',
          title: 'Senza feed',
          position: 1,
          portalUrl: 'https://learn.epicode.edu.mt/y',
          parts: [],
          feed: null,
        },
      ],
    },
  ],
};

const correction = (subject = subjectId): StoredCorrection => ({
  id: '60000000-0000-4000-8000-000000000001',
  subjectId: subject,
  correction: {
    kind: 'text',
    lessonId,
    itemType: 'card',
    itemId: 'stack-rule',
    edits: [{ field: 'keyPoint', language: 'it', original: 'FIFO', corrected: 'LIFO' }],
    reason: 'content',
    snapshot: {},
  },
  claudeStatus: 'pending',
  completion: null,
  createdAt: '2026-11-25T10:00:00.000Z',
});

describe('correctSubject', () => {
  it('applica le correzioni della materia e segna le schede', () => {
    const result = correctSubject(feed, [correction()]);
    expect(result.feed.chapters[0]?.lessons[0]?.feed?.cards[0]?.keyPoint.it).toBe(
      'Una pila è LIFO.',
    );
    expect(result.corrected.has(correctedKey(lessonId, 'stack-rule'))).toBe(true);
    expect(result.outcomes.get(correction().id)).toBe('applied');
    // La copia scaricata resta com'era.
    expect(feed.chapters[0]?.lessons[0]?.feed?.cards[0]?.keyPoint.it).toBe('Una pila è FIFO.');
  });

  it('senza correzioni della materia restituisce lo stesso oggetto', () => {
    const other = '40000000-0000-4000-8000-000000000009';
    expect(correctSubject(feed, [correction(other)]).feed).toBe(feed);
  });
});
