import { describe, expect, it } from 'vitest';
import {
  applyReview,
  conceptId,
  currentDayStreak,
  EMPTY_DAY_STREAK,
  extendDayStreak,
  gradeFromAnswer,
  gradeFromScore,
  isDue,
  isStable,
  localDay,
  newReviewState,
  recallProbability,
} from './review.js';

const ID = conceptId('subject-1', 'stack');
const T0 = new Date('2026-11-23T10:00:00Z');
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe('valutazioni', () => {
  it('trasforma una risposta in valutazione', () => {
    expect(gradeFromAnswer(false)).toBe('again');
    expect(gradeFromAnswer(false, true)).toBe('again');
    expect(gradeFromAnswer(true, true)).toBe('hard');
    expect(gradeFromAnswer(true)).toBe('good');
  });

  it('usa le soglie dell’ADR 0014 per i punteggi', () => {
    expect(gradeFromScore(0)).toBe('again');
    expect(gradeFromScore(0.49)).toBe('again');
    expect(gradeFromScore(Number.NaN)).toBe('again');
    expect(gradeFromScore(0.5)).toBe('hard');
    expect(gradeFromScore(0.8)).toBe('hard');
    expect(gradeFromScore(0.81)).toBe('good');
    expect(gradeFromScore(1)).toBe('good');
  });
});

describe('applyReview', () => {
  it('parte da un concetto nuovo che scade subito', () => {
    const state = newReviewState(ID, T0);
    expect(state.phase).toBe('new');
    expect(isDue(state, T0)).toBe(true);
    expect(recallProbability(state, T0)).toBe(0);
  });

  it('allontana la scadenza con le risposte giuste e la avvicina con gli errori', () => {
    const first = applyReview(undefined, ID, 'good', T0, 'q1');
    expect(first.reps).toBe(1);
    expect(first.lastQuestionId).toBe('q1');
    expect(first.lastGrade).toBe('good');
    expect(isDue(first, T0)).toBe(false);

    let state = first;
    let at = T0;
    for (let i = 0; i < 4; i += 1) {
      at = new Date(state.due);
      state = applyReview(state, ID, 'good', at);
    }
    expect(state.phase).toBe('review');
    expect(state.stability).toBeGreaterThan(7);
    expect(isStable(state)).toBe(true);
    expect(state.lastQuestionId).toBe('q1');
    expect(recallProbability(state, at)).toBeGreaterThan(0.9);

    const lapse = applyReview(state, ID, 'again', new Date(state.due));
    expect(lapse.lapses).toBe(1);
    expect(lapse.wrong).toBe(1);
    expect(lapse.phase).toBe('relearning');
    expect(isStable(lapse)).toBe(false);
    expect(new Date(lapse.due).getTime() - new Date(state.due).getTime()).toBeLessThan(86_400_000);
  });

  it('è deterministico: stesso storico, stesse date', () => {
    const a = applyReview(applyReview(undefined, ID, 'good', T0), ID, 'hard', days(1));
    const b = applyReview(applyReview(undefined, ID, 'good', T0), ID, 'hard', days(1));
    expect(a).toEqual(b);
  });

  it('non accetta date precedenti all’ultima risposta', () => {
    const first = applyReview(undefined, ID, 'good', days(2));
    const late = applyReview(first, ID, 'again', T0);
    expect(late.lastReview).toBe(days(2).toISOString());
  });
});

describe('serie di giorni', () => {
  it('conta i giorni di fila', () => {
    let streak = extendDayStreak(EMPTY_DAY_STREAK, '2026-11-23');
    expect(streak).toEqual({ lastDay: '2026-11-23', days: 1, best: 1 });
    expect(extendDayStreak(streak, '2026-11-23')).toBe(streak);
    streak = extendDayStreak(streak, '2026-11-24');
    streak = extendDayStreak(streak, '2026-11-25');
    expect(streak.days).toBe(3);
    streak = extendDayStreak(streak, '2026-11-28');
    expect(streak).toEqual({ lastDay: '2026-11-28', days: 1, best: 3 });
  });

  it('attraversa i cambi di mese', () => {
    const streak = extendDayStreak({ lastDay: '2026-11-30', days: 4, best: 4 }, '2026-12-01');
    expect(streak.days).toBe(5);
  });

  it('mostra 0 se la serie si è interrotta', () => {
    const streak = { lastDay: '2026-11-23', days: 4, best: 6 };
    expect(currentDayStreak(streak, '2026-11-23')).toBe(4);
    expect(currentDayStreak(streak, '2026-11-24')).toBe(4);
    expect(currentDayStreak(streak, '2026-11-25')).toBe(0);
    expect(currentDayStreak(EMPTY_DAY_STREAK, '2026-11-25')).toBe(0);
  });

  it('usa il giorno locale', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
