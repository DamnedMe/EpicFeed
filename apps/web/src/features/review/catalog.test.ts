import { conceptId } from '@study-feed/core';
import { describe, expect, it } from 'vitest';
import type { FeedLesson, SubjectFeed } from '../feed/model';
import { entryKey } from '../feed/model';
import { buildReviewCatalog, recallBlank } from './catalog';

const bi = (it: string, en: string) => ({ it, en });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const portal = (n: number) => `https://learn.epicode.edu.mt/course/177/curriculum/${n}`;

function lesson(
  n: number,
  concepts: { key: string; name: string; description: string }[],
  quizKeys: string[],
  terms: string[],
): FeedLesson {
  return {
    lessonId: id(n),
    title: `Lezione ${n}`,
    position: n,
    portalUrl: portal(n),
    parts: [],
    feed: {
      lessonId: id(n),
      sourcesHash: 'a'.repeat(64),
      promptVersion: '2026-11-21.1',
      generatedAt: '2026-11-22T10:00:00.000Z',
      cards: [
        {
          id: `card-${n}`,
          kind: 'concept',
          title: bi('Titolo', 'Title'),
          keyPoint: bi('Frase.', 'Key point.'),
          body: bi('Corpo.', 'Body.'),
          terms,
          conceptKeys: concepts.map((concept) => concept.key),
          sourcePartId: id(n * 10),
          origin: 'summary',
          video: null,
        },
      ],
      quiz: quizKeys.map((key, index) => ({
        id: `q-${key}-${index}`,
        kind: 'true_false' as const,
        question: bi('Vero?', 'True?'),
        answer: true,
        explanation: bi('Sì.', 'Yes.'),
        conceptKey: key,
        difficulty: 1 as const,
      })),
      concepts: concepts.map((concept) => ({
        key: concept.key,
        name: bi(concept.name, concept.name),
        description: bi(concept.description, concept.description),
      })),
    },
  } as unknown as FeedLesson;
}

const feed: SubjectFeed = {
  subjectId: id(900),
  title: 'DSA',
  version: 'f'.repeat(64),
  chapters: [
    {
      chapterId: id(800),
      title: '2. Stacks and queues',
      lessons: [
        lesson(
          1,
          [
            {
              key: 'stack',
              name: 'Stack',
              description: 'A linear data structure following the LIFO principle.',
            },
          ],
          ['stack', 'stack', 'ghost'],
          ['LIFO'],
        ),
      ],
    },
    {
      chapterId: id(801),
      title: '3. Trees',
      lessons: [
        lesson(
          2,
          [
            { key: 'stack', name: 'Stack (again)', description: 'Repeated.' },
            { key: 'tree', name: 'Tree', description: 'A Tree is hierarchical.' },
          ],
          ['tree', 'stack'],
          ['push'],
        ),
        { ...lesson(3, [], [], []), feed: null },
      ],
    },
  ],
};

describe('buildReviewCatalog', () => {
  const catalog = buildReviewCatalog(feed);

  it('unisce lo stesso concetto di più lezioni e tiene i testi della prima', () => {
    expect(catalog.concepts.map((concept) => concept.key)).toEqual(['stack', 'tree']);
    const stack = catalog.conceptsById.get(conceptId(id(900), 'stack'));
    expect(stack?.name.en).toBe('Stack');
    expect(stack?.chapterIndex).toBe(0);
    expect(stack?.terms).toEqual(['LIFO', 'push']);
    expect(catalog.chapterTitles).toEqual(['2. Stacks and queues', '3. Trees']);
  });

  it('raccoglie le domande con la chiave del feed e scarta quelle senza concetto', () => {
    expect(catalog.questions).toEqual([
      { id: entryKey(id(1), 'quiz', 'q-stack-0'), conceptId: conceptId(id(900), 'stack') },
      { id: entryKey(id(1), 'quiz', 'q-stack-1'), conceptId: conceptId(id(900), 'stack') },
      { id: entryKey(id(2), 'quiz', 'q-tree-0'), conceptId: conceptId(id(900), 'tree') },
      { id: entryKey(id(2), 'quiz', 'q-stack-1'), conceptId: conceptId(id(900), 'stack') },
    ]);
    const entry = catalog.questionsById.get(entryKey(id(2), 'quiz', 'q-tree-0'));
    expect(entry?.chapterTitle).toBe('3. Trees');
    expect(entry?.lessonTitle).toBe('Lezione 2');
  });
});

describe('recallBlank', () => {
  const catalog = buildReviewCatalog(feed);
  const get = (key: string) => {
    const concept = catalog.conceptsById.get(conceptId(id(900), key));
    if (!concept) throw new Error(key);
    return concept;
  };

  it('copre un termine del glossario', () => {
    const stack = get('stack');
    const range = recallBlank(stack, 'en');
    expect(range && stack.description.en.slice(range.start, range.end)).toBe('LIFO');
  });

  it('ripiega sul nome del concetto, oppure niente', () => {
    const tree = get('tree');
    const range = recallBlank(tree, 'en');
    expect(range && tree.description.en.slice(range.start, range.end)).toBe('Tree');
    expect(recallBlank({ ...tree, name: bi('Grafo', 'Graph') }, 'en')).toBeNull();
  });
});
