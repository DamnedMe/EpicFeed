import { describe, expect, it } from 'vitest';
import type { ExamExerciseItem } from './catalog';
import { pickInterviewQuestions } from './interview-plan';

const item = (key: string, kind: ExamExerciseItem['kind'], concept: string): ExamExerciseItem => ({
  key,
  title: key,
  group: 'official',
  context: 'Page 1',
  kind,
  prompt: `${key}?`,
  code: null,
  signature: null,
  tests: [],
  hints: [],
  modelAnswer: 'answer',
  rubric: [{ criterion: 'Correct', points: 2 }],
  conceptKeys: [concept],
  followUp: 'Why?',
});

/** Generatore deterministico. */
const fixed = () => 0.42;

describe('pickInterviewQuestions', () => {
  it('concetti diversi e al massimo un esercizio di codice', () => {
    const exercises = [
      item('a', 'code', 'stack'),
      item('b', 'code', 'queue'),
      item('c', 'explain', 'stack'),
      item('d', 'explain', 'tree'),
      item('e', 'analyze', 'graph'),
      item('f', 'explain', 'heap'),
    ];
    const picked = pickInterviewQuestions(exercises, fixed, 4);
    expect(picked).toHaveLength(4);
    expect(picked.filter((q) => q.kind === 'code').length).toBeLessThanOrEqual(1);
    expect(new Set(picked.map((q) => q.conceptKeys[0])).size).toBe(4);
  });

  it('se i concetti non bastano completa con le altre domande', () => {
    const exercises = [item('a', 'explain', 'stack'), item('b', 'explain', 'stack')];
    expect(pickInterviewQuestions(exercises, fixed, 4)).toHaveLength(2);
    expect(pickInterviewQuestions([], fixed)).toEqual([]);
  });
});
