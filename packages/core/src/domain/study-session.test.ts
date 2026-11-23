import { describe, expect, it } from 'vitest';
import { answerPoints, buildStudySequence, POINTS, SESSION_MS } from './study-session.js';

const card = (...conceptKeys: string[]) => ({ conceptKeys });
const quiz = (conceptKey: string) => ({ conceptKey });

describe('buildStudySequence', () => {
  it('mette una domanda ogni tre schede, preferendo i concetti appena visti', () => {
    const items = buildStudySequence([
      {
        lessonId: 'L1',
        cards: [card('a'), card('b'), card('c'), card('d'), card('e'), card('f'), card('g')],
        quiz: [quiz('z'), quiz('e'), quiz('b')],
      },
    ]);
    expect(items.map((item) => `${item.type[0]}${item.index}`)).toEqual([
      'c0',
      'c1',
      'c2',
      'q2',
      'c3',
      'c4',
      'c5',
      'q1',
      'c6',
    ]);
  });

  it('chiude la lezione con una domanda se ne sono passate almeno due schede', () => {
    const items = buildStudySequence([
      { lessonId: 'L1', cards: [card('a'), card('b')], quiz: [quiz('x')] },
      { lessonId: 'L2', cards: [card('a')], quiz: [quiz('a')] },
      { lessonId: 'L3', cards: [card('a'), card('b'), card('c')], quiz: [] },
    ]);
    expect(items).toEqual([
      { type: 'card', lessonId: 'L1', index: 0 },
      { type: 'card', lessonId: 'L1', index: 1 },
      { type: 'quiz', lessonId: 'L1', index: 0 },
      { type: 'card', lessonId: 'L2', index: 0 },
      { type: 'card', lessonId: 'L3', index: 0 },
      { type: 'card', lessonId: 'L3', index: 1 },
      { type: 'card', lessonId: 'L3', index: 2 },
    ]);
  });
});

describe('answerPoints', () => {
  it('aggiunge il bonus di serie fino al tetto', () => {
    expect(answerPoints(1)).toBe(POINTS.answer);
    expect(answerPoints(2)).toBe(12);
    expect(answerPoints(9)).toBe(POINTS.answer + POINTS.streakMax);
    expect(answerPoints(0)).toBe(POINTS.answer);
    expect(SESSION_MS).toBe(300_000);
  });
});
