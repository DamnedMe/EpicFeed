import { describe, expect, it } from 'vitest';
import { BATCH_PACING, estimateMinutes, jitter } from './pacing';

describe('jitter', () => {
  it('resta nell’intervallo', () => {
    expect(jitter([1000, 2000], () => 0)).toBe(1000);
    expect(jitter([1000, 2000], () => 0.5)).toBe(1500);
    expect(jitter([1000, 2000], () => 0.999_999)).toBe(2000);
  });
});

describe('estimateMinutes', () => {
  it('somma pause, player e invii, con la pausa lunga al cambio di capitolo', () => {
    const pacing = {
      betweenParts: [1000, 1000],
      betweenVideos: [2000, 2000],
      betweenLessons: [10_000, 10_000],
      betweenChapters: [60_000, 60_000],
    } as const;
    // Lezione 1: 2 video + 1 testo → 2 pause parti (2 s) + 2 player (8 s) + 1 pausa video (2 s) + invio (1,5 s) = 13,5 s.
    // Lezione 2 (stesso capitolo): pausa 10 s + 1 player 4 s + invio 1,5 s = 15,5 s.
    // Lezione 3 (altro capitolo): pausa 60 s + 1 testo + invio 1,5 s = 61,5 s. Totale 90,5 s → 2 min.
    expect(
      estimateMinutes(
        [
          { chapterId: 'a', videos: 2, readings: 1 },
          { chapterId: 'a', videos: 1, readings: 0 },
          { chapterId: 'b', videos: 0, readings: 1 },
        ],
        pacing,
      ),
    ).toBe(2);
  });

  it('almeno un minuto, e un corso intero richiede decine di minuti', () => {
    expect(estimateMinutes([])).toBe(1);
    const course = Array.from({ length: 36 }, (_, index) => ({
      chapterId: String(Math.floor(index / 6)),
      videos: 3,
      readings: 1,
    }));
    const minutes = estimateMinutes(course, BATCH_PACING);
    expect(minutes).toBeGreaterThan(10);
    expect(minutes).toBeLessThan(60);
  });
});
