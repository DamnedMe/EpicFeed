import { describe, expect, it } from 'vitest';
import { answerPoints, buildStudySequence, POINTS, SESSION_MS } from './study-session.js';

const card = (...conceptKeys: string[]) => ({ conceptKeys });
const quiz = (conceptKey: string) => ({ conceptKey });

const short = (items: ReturnType<typeof buildStudySequence>) =>
  items.map((item) =>
    item.type === 'card'
      ? `c${item.index}`
      : `q${item.index}(${item.batch.position}/${item.batch.size})`,
  );

describe('buildStudySequence', () => {
  it('dopo ogni tre schede fa fino a tre domande, prima sui concetti appena letti', () => {
    const items = buildStudySequence([
      {
        lessonId: 'L1',
        cards: [card('a'), card('b'), card('c', 'a'), card('d'), card('e'), card('f'), card('g')],
        quiz: [quiz('a'), quiz('e'), quiz('b'), quiz('d'), quiz('a'), quiz('c'), quiz('g')],
      },
    ]);
    expect(short(items)).toEqual([
      'c0',
      'c1',
      'c2',
      // a, b, c appena letti: le prime tre domande su questi concetti.
      'q0(1/3)',
      'q2(2/3)',
      'q4(3/3)',
      'c3',
      'c4',
      'c5',
      // d ed e appena letti, poi c (già letto nella lezione).
      'q1(1/3)',
      'q3(2/3)',
      'q5(3/3)',
      'c6',
      // Fine lezione: g, appena letto.
      'q6(1/1)',
    ]);
  });

  it('non chiede mai di un concetto che non si è ancora visto', () => {
    const items = buildStudySequence([
      {
        lessonId: 'L1',
        cards: [card('a'), card('b'), card('c'), card('d')],
        quiz: [quiz('d'), quiz('z'), quiz('a')],
      },
    ]);
    // Dopo tre schede c'è solo la domanda su a; quella su d arriva dopo la scheda d;
    // quella su z (mai comparso) resta fuori.
    expect(short(items)).toEqual(['c0', 'c1', 'c2', 'q2(1/1)', 'c3', 'q0(1/1)']);
  });

  it('chiude la lezione con le domande rimaste e salta le lezioni senza domande', () => {
    const items = buildStudySequence([
      { lessonId: 'L1', cards: [card('x'), card('y')], quiz: [quiz('x')] },
      { lessonId: 'L2', cards: [card('a')], quiz: [quiz('a')] },
      { lessonId: 'L3', cards: [card('a'), card('b'), card('c')], quiz: [] },
    ]);
    expect(items).toEqual([
      { type: 'card', lessonId: 'L1', index: 0 },
      { type: 'card', lessonId: 'L1', index: 1 },
      { type: 'quiz', lessonId: 'L1', index: 0, batch: { position: 1, size: 1 } },
      { type: 'card', lessonId: 'L2', index: 0 },
      { type: 'quiz', lessonId: 'L2', index: 0, batch: { position: 1, size: 1 } },
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
