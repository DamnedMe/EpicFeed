import type { AnswerRecord } from '@epicfeed/review';
import { describe, expect, it } from 'vitest';
import { subjectConcepts, subjectProgress } from './concepts.js';
import { SUBJECT_ID, dsaFeed } from './testing.js';

const answer = (key: string, grade: AnswerRecord['grade'], at: string): AnswerRecord => ({
  conceptId: `${SUBJECT_ID}:${key}`,
  questionId: null,
  source: 'feed',
  grade,
  language: 'it',
  at,
});

describe('concetti deboli', () => {
  it('elenca i concetti della materia una volta sola, con la lezione', () => {
    const concepts = subjectConcepts(dsaFeed());
    expect(concepts.map((c) => c.key)).toEqual(['avl-rotation', 'heap-sift']);
    expect(concepts[0]?.lessonTitle).toBe('Binary trees & AVL trees');
  });

  it('mette prima il concetto più sbagliato e ignora quelli di altre materie', () => {
    const answers = [
      answer('avl-rotation', 'again', '2026-11-20T10:00:00.000Z'),
      answer('avl-rotation', 'again', '2026-11-21T10:00:00.000Z'),
      answer('heap-sift', 'again', '2026-11-21T11:00:00.000Z'),
      answer('heap-sift', 'good', '2026-11-22T11:00:00.000Z'),
      { ...answer('x', 'again', '2026-11-22T11:00:00.000Z'), conceptId: 'altra:x' },
    ];
    const progress = subjectProgress(dsaFeed(), answers, new Date('2026-11-28T10:00:00.000Z'));
    expect(progress.concepts).toBe(2);
    expect(progress.seen).toBe(2);
    expect(progress.weak.map((w) => w.concept.key)).toEqual(['avl-rotation', 'heap-sift']);
    expect(progress.weak[0]?.state.wrong).toBe(2);
    expect(progress.weak[0]?.due).toBe(true);
    expect(progress.due).toBeGreaterThan(0);
  });

  it('senza errori non ci sono concetti deboli', () => {
    const progress = subjectProgress(
      dsaFeed(),
      [answer('heap-sift', 'good', '2026-11-27T10:00:00.000Z')],
      new Date('2026-11-28T10:00:00.000Z'),
    );
    expect(progress.weak).toEqual([]);
  });
});
