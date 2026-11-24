import { checkExamPack } from '@study-feed/core';
import { describe, expect, it } from 'vitest';
import { examPackDraftSchema, saveExamPackRequestSchema, storedExamPackSchema } from './exam.js';

const LESSON = '11111111-1111-4111-8111-111111111111';
const FEED = '22222222-2222-4222-8222-222222222222';

/** Pacchetto minimo ma realistico, come lo produrrebbe Claude. */
const pack = {
  questions: Array.from({ length: 10 }, (_, n) => ({
    id: `q-${n}`,
    question: `Which rotation fixes case ${n}?`,
    options: ['Left', 'Right', 'Left-right', 'Right-left'],
    correctIndex: n % 4,
    explanation: 'It restores the balance factor.',
    conceptKey: 'avl-tree',
    difficulty: 2,
  })),
  openQuestions: [
    {
      id: 'height',
      kind: 'code',
      prompt: 'Write a function that returns the height of a binary tree.',
      signature: 'def height(node) -> int:',
      tests: [
        { call: 'height(None)', expected: '-1' },
        { call: 'height(Node(1))', expected: '0' },
      ],
      hints: [{ it: 'Pensa in modo ricorsivo.', en: 'Think recursively.' }],
      modelAnswer: '```python\ndef height(node):\n    ...\n```',
      rubric: [
        { criterion: 'Correct base case', points: 2 },
        { criterion: 'Recursive step', points: 2 },
        { criterion: 'O(n) time', points: 1 },
      ],
      conceptKeys: ['avl-tree'],
      followUp: 'How would you do it iteratively?',
    },
  ],
};

describe('examPackDraftSchema', () => {
  it('accetta un pacchetto realistico, coerente per il core', () => {
    const parsed = examPackDraftSchema.parse(pack);
    expect(
      checkExamPack(parsed, { conceptKeys: new Set(['avl-tree']), feedQuestions: [] }),
    ).toEqual([]);
  });

  it('rifiuta campi inattesi, testi su più righe e troppe domande', () => {
    expect(examPackDraftSchema.safeParse({ ...pack, extra: 1 }).success).toBe(false);
    const multiline = { ...pack.questions[0], options: ['a\nb', 'c', 'd', 'e'] };
    expect(examPackDraftSchema.safeParse({ ...pack, questions: [multiline] }).success).toBe(false);
    const many = Array.from({ length: 13 }, () => pack.questions[0]);
    expect(examPackDraftSchema.safeParse({ ...pack, questions: many }).success).toBe(false);
  });
});

describe('saveExamPackRequestSchema', () => {
  it('richiede lezione, feed e versione del prompt', () => {
    const body = { lessonId: LESSON, feedId: FEED, promptVersion: '2026-11-24.1', pack };
    expect(saveExamPackRequestSchema.safeParse(body).success).toBe(true);
    expect(saveExamPackRequestSchema.safeParse({ ...body, promptVersion: 'v1' }).success).toBe(
      false,
    );
  });
});

describe('storedExamPackSchema', () => {
  it('legge un pacchetto salvato', () => {
    const stored = {
      ...pack,
      lessonId: LESSON,
      feedId: FEED,
      promptVersion: '2026-11-24.1',
      generatedAt: '2026-11-24T10:00:00.000Z',
    };
    expect(storedExamPackSchema.safeParse(stored).success).toBe(true);
  });
});
