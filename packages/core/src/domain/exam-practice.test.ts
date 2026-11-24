import { describe, expect, it } from 'vitest';
import { drawRandom, rubricScore, testPassed } from './exam-practice.js';

/** Generatore deterministico per i test. */
function sequence(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('drawRandom', () => {
  it('estrae senza ripetizioni e senza toccare l’elenco', () => {
    const items = Array.from({ length: 90 }, (_, i) => i);
    const drawn = drawRandom(items, 50, sequence([0.7, 0.1, 0.99, 0.5]));
    expect(drawn).toHaveLength(50);
    expect(new Set(drawn).size).toBe(50);
    expect(items).toEqual(Array.from({ length: 90 }, (_, i) => i));
  });

  it('prende tutti gli elementi se sono meno di quelli chiesti', () => {
    const drawn = drawRandom(['a', 'b', 'c'], 50, () => 0);
    expect([...drawn].sort()).toEqual(['a', 'b', 'c']);
  });

  it('con zero o un numero negativo non estrae niente', () => {
    expect(drawRandom([1, 2], 0, Math.random)).toEqual([]);
    expect(drawRandom([1, 2], -3, Math.random)).toEqual([]);
  });
});

describe('rubricScore', () => {
  const rubric = [
    { criterion: 'Correct', points: 4 },
    { criterion: 'Complexity', points: 2 },
    { criterion: 'Clarity', points: 2 },
  ];

  it('somma i punti sul totale', () => {
    expect(rubricScore(rubric, [4, 1, 1])).toBe(0.75);
  });

  it('limita le voci ai punti del criterio e ignora valori non validi', () => {
    expect(rubricScore(rubric, [9, -1, Number.NaN])).toBe(0.5);
  });

  it('vale 0 senza voci o con griglia vuota', () => {
    expect(rubricScore(rubric, [])).toBe(0);
    expect(rubricScore([], [1])).toBe(0);
  });
});

describe('testPassed', () => {
  it('confronta i repr senza spazi ai lati', () => {
    expect(testPassed({ call: 'f()', expected: 'True', actual: 'True ', error: null })).toBe(true);
    expect(testPassed({ call: 'f()', expected: '[1, 2]', actual: '[2, 1]', error: null })).toBe(
      false,
    );
  });

  it('un errore fa fallire il test', () => {
    expect(testPassed({ call: 'f()', expected: 'None', actual: null, error: 'NameError: f' })).toBe(
      false,
    );
  });
});
