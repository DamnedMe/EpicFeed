import { describe, expect, it } from 'vitest';
import type { CardEntry, QuizEntry, SubjectFeed } from '../feed/model';
import { entryContext } from './context';

const bi = <T>(it: T, en: T) => ({ it, en });
const lessonId = '00000000-0000-4000-8000-000000000001';

const card = {
  id: 'rot',
  kind: 'steps',
  title: bi('Rotazioni', 'Rotations'),
  keyPoint: bi('Si ribilancia.', 'It rebalances.'),
  body: bi('Corpo.', 'Body.'),
  steps: bi(['Ruota il figlio', 'Ruota il nodo'], ['Rotate the child', 'Rotate the node']),
  comparison: {
    left: bi('Singola', 'Single'),
    right: bi('Doppia', 'Double'),
    rows: [{ aspect: bi('Casi', 'Cases'), left: bi('LL', 'LL'), right: bi('LR', 'LR') }],
  },
  code: { language: 'python', source: 'rotate(n)' },
  terms: ['AVL'],
  conceptKeys: ['avl'],
  sourcePartId: lessonId,
  origin: 'summary',
  video: null,
} as unknown as CardEntry['card'];

const quiz = {
  id: 'q',
  kind: 'multiple_choice',
  question: bi('Quale?', 'Which?'),
  options: bi(['Sinistra', 'Destra'], ['Left', 'Right']),
  correctIndex: 1,
  explanation: bi('Perché.', 'Because.'),
  conceptKey: 'avl',
  difficulty: 1,
} as unknown as QuizEntry['quiz'];

const feed = {
  subjectId: lessonId,
  title: 'DSA',
  version: 'f'.repeat(64),
  chapters: [
    {
      chapterId: lessonId,
      title: 'Alberi',
      lessons: [
        {
          lessonId,
          title: 'AVL',
          position: 0,
          portalUrl: 'https://example.com',
          parts: [],
          feed: {
            cards: [card],
            quiz: [quiz],
            concepts: [
              { key: 'avl', name: bi('Rotazioni AVL', 'AVL rotations'), description: bi('d', 'd') },
              { key: 'altro', name: bi('Altro', 'Other'), description: bi('d', 'd') },
            ],
          },
        },
      ],
    },
  ],
} as unknown as SubjectFeed;

const base = {
  key: 'k',
  chapterIndex: 0,
  chapterTitle: 'Alberi',
  lessonId,
  lessonTitle: 'AVL',
  lessonPortalUrl: 'https://example.com',
};

describe('contesto per l’assistente', () => {
  it('scheda: testo completo nelle due lingue e concetti toccati', () => {
    const context = entryContext(feed, { ...base, type: 'card', card, source: null, video: null });
    expect(context.subjectTitle).toBe('DSA');
    expect(context.text.it).toContain('Si ribilancia.');
    expect(context.text.it).toContain('1. Ruota il figlio');
    expect(context.text.en).toContain('Cases: Single LL / Double LR');
    expect(context.text.en).toContain('```python\nrotate(n)\n```');
    expect(context.concepts.map((c) => c.name.en)).toEqual(['AVL rotations']);
  });

  it('domanda: opzioni, soluzione e spiegazione', () => {
    const context = entryContext(feed, {
      ...base,
      type: 'quiz',
      quiz,
      batch: { index: 0, size: 1 },
    } as unknown as QuizEntry);
    expect(context.title.it).toBe('Quale?');
    expect(context.text.it).toContain('B) Destra');
    expect(context.text.it).toContain('Risposta giusta: B.');
    expect(context.text.en).toContain('Because.');
    const tf = entryContext(feed, {
      ...base,
      type: 'quiz',
      quiz: { ...quiz, kind: 'true_false', answer: false, conceptKey: 'manca' },
      batch: { index: 0, size: 1 },
    } as unknown as QuizEntry);
    expect(tf.text.en).toContain('Correct answer: false.');
    expect(tf.concepts).toEqual([]);
  });
});
