import { examContentResponseSchema } from '@epicfeed/exam';
import { describe, expect, it } from 'vitest';
import type { FeedLesson, SubjectFeed } from '../feed/model';
import { buildExamCatalog } from './catalog';

const bi = <T>(it: T, en: T) => ({ it, en });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function lesson(n: number, withFeed = true): FeedLesson {
  return {
    lessonId: id(n),
    title: `Lesson ${n}`,
    position: n,
    portalUrl: `https://learn.epicode.edu.mt/course/177/curriculum/${n}`,
    parts: [],
    feed: withFeed
      ? {
          quiz: [
            {
              id: 'tf',
              kind: 'true_false',
              question: bi('Vero?', 'True?'),
              answer: false,
              explanation: bi('No.', 'No.'),
              conceptKey: 'stack',
              difficulty: 1,
            },
            {
              id: 'mc',
              kind: 'multiple_choice',
              question: bi('Quale?', 'Which?'),
              options: bi(['a', 'b'], ['A', 'B']),
              correctIndex: 1,
              explanation: bi('B.', 'B.'),
              conceptKey: 'queue',
              difficulty: 2,
            },
          ],
        }
      : null,
  } as unknown as FeedLesson;
}

const feed: SubjectFeed = {
  subjectId: id(900),
  title: 'DSA',
  version: 'f'.repeat(64),
  chapters: [
    { chapterId: id(800), title: '1. Stacks', lessons: [lesson(1), lesson(2, false)] },
    { chapterId: id(801), title: '2. Empty', lessons: [lesson(3, false)] },
  ],
};

const open = {
  kind: 'code' as const,
  prompt: 'Write is_balanced(s). It returns True if brackets match.',
  signature: 'def is_balanced(s: str) -> bool:',
  tests: [{ call: "is_balanced('()')", expected: 'True' }],
  hints: [bi('Usa una pila.', 'Use a stack.')],
  modelAnswer: 'def is_balanced(s): ...',
  rubric: [{ criterion: 'Correct', points: 3 }],
  conceptKeys: ['stack'],
  followUp: 'What is the complexity?',
};

// Passa dallo schema: la prova usa dati validi come quelli del server.
const content = examContentResponseSchema.parse({
  subjectId: id(900),
  version: 'e'.repeat(64),
  packs: [
    {
      lessonId: id(1),
      feedId: id(700),
      promptVersion: '2026-11-24.1',
      generatedAt: '2026-11-24T10:00:00.000Z',
      questions: [
        {
          id: 'x1',
          question: 'Pick one',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 2,
          explanation: 'C.',
          conceptKey: 'stack',
          difficulty: 2,
        },
      ],
      openQuestions: [{ id: 'balanced', ...open }],
    },
  ],
  bank: {
    subjectId: id(900),
    promptVersion: '2026-11-24.1',
    generatedAt: '2026-11-24T10:00:00.000Z',
    exercises: [
      {
        id: 'late-a',
        ...open,
        title: 'Late variant',
        origin: 'variant',
        variantOf: 'late',
        page: 9,
      },
      { id: 'late', ...open, title: 'Late', origin: 'official', page: 9 },
      { id: 'early', ...open, title: 'Early', origin: 'official', page: 2 },
      {
        id: 'early-a',
        ...open,
        title: 'Early variant',
        origin: 'variant',
        variantOf: 'early',
        page: 2,
      },
    ],
  },
});

describe('buildExamCatalog', () => {
  it('unisce domande del feed (in inglese) e del pacchetto per modulo', () => {
    const catalog = buildExamCatalog(feed, content);
    expect(catalog.modules).toHaveLength(1);
    const [module] = catalog.modules;
    expect(module?.questions.map((q) => [q.question, q.options, q.correctIndex, q.source])).toEqual(
      [
        ['True?', ['True', 'False'], 1, 'feed'],
        ['Which?', ['A', 'B'], 1, 'feed'],
        ['Pick one', ['A', 'B', 'C', 'D'], 2, 'exam'],
      ],
    );
    expect(new Set(module?.questions.map((q) => q.key)).size).toBe(3);
    expect(catalog.packs).toEqual({ ready: 1, lessons: 1 });
  });

  it('mette prima la banca, ogni ufficiale con le sue varianti, poi le lezioni', () => {
    const catalog = buildExamCatalog(feed, content);
    expect(catalog.exercises.map((e) => `${e.group}:${e.title}`)).toEqual([
      'official:Early',
      'variant:Early variant',
      'official:Late',
      'variant:Late variant',
      'lesson:Write is_balanced(s).',
    ]);
    expect(catalog.exercisesByKey.get('bank:early')?.context).toBe('Exam Prep, p. 2');
    expect(catalog.exercises.at(-1)?.context).toBe('Lesson 1');
    expect(catalog.hasBank).toBe(true);
  });

  it('senza contenuti d’esame restano le domande del feed', () => {
    const catalog = buildExamCatalog(feed, { ...content, packs: [], bank: null });
    expect(catalog.modules[0]?.questions).toHaveLength(2);
    expect(catalog.exercises).toEqual([]);
    expect(catalog.hasBank).toBe(false);
  });
});
