import { describe, expect, it } from 'vitest';
import type { ConceptReviewState, DayStreak } from '../domain/index.js';
import { applyReview, conceptId, EMPTY_DAY_STREAK } from '../domain/index.js';
import type { AnswerRecord, ProgressStore, ReviewConcept, ReviewQuestion } from './review.js';
import {
  completeReviewSession,
  planReviewSession,
  recordAnswer,
  summarizeReview,
} from './review.js';

const NOW = new Date('2026-11-23T10:00:00Z');
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const clockAt = (date: Date) => ({ now: () => date });

/** Progressi in memoria per i test. */
class MemoryStore implements ProgressStore {
  readonly reviews = new Map<string, ConceptReviewState>();
  readonly answers: AnswerRecord[] = [];
  streak: DayStreak = EMPTY_DAY_STREAK;
  loadReviews() {
    return Promise.resolve([...this.reviews.values()]);
  }
  getReview(id: string) {
    return Promise.resolve(this.reviews.get(id));
  }
  saveAnswer(state: ConceptReviewState, answer: AnswerRecord) {
    this.reviews.set(state.conceptId, state);
    this.answers.push(answer);
    return Promise.resolve();
  }
  loadDayStreak() {
    return Promise.resolve(this.streak);
  }
  saveDayStreak(streak: DayStreak) {
    this.streak = streak;
    return Promise.resolve();
  }
}

const id = (key: string) => conceptId('s1', key);

/** Concetto ripassato sempre bene alle scadenze, da `start` fino a dopo `until`. */
function matured(key: string, start: Date, until: Date): ConceptReviewState {
  let state = applyReview(undefined, id(key), 'good', start);
  while (new Date(state.due) <= until)
    state = applyReview(state, id(key), 'good', new Date(state.due));
  return state;
}
const concepts: ReviewConcept[] = [
  { id: id('stack'), key: 'stack', chapterIndex: 1 },
  { id: id('queue'), key: 'queue', chapterIndex: 1 },
  { id: id('tree'), key: 'tree', chapterIndex: 2 },
  { id: id('lonely'), key: 'lonely', chapterIndex: 2 },
];
const questions: ReviewQuestion[] = [
  { id: 'q-stack-1', conceptId: id('stack') },
  { id: 'q-stack-2', conceptId: id('stack') },
  { id: 'q-queue-1', conceptId: id('queue') },
  { id: 'q-tree-1', conceptId: id('tree') },
];

describe('recordAnswer', () => {
  it('aggiorna il concetto e registra la risposta con la lingua', async () => {
    const store = new MemoryStore();
    const state = await recordAnswer(store, clockAt(NOW), {
      subjectId: 's1',
      conceptKey: 'stack',
      questionId: 'q-stack-1',
      source: 'feed',
      grade: 'again',
      language: 'en',
    });
    expect(state.conceptId).toBe(id('stack'));
    expect(state.wrong).toBe(1);
    expect(store.answers).toEqual([
      {
        conceptId: id('stack'),
        questionId: 'q-stack-1',
        source: 'feed',
        grade: 'again',
        language: 'en',
        at: NOW.toISOString(),
      },
    ]);
    const again = await recordAnswer(store, clockAt(later(1)), {
      subjectId: 's1',
      conceptKey: 'stack',
      questionId: null,
      source: 'review',
      grade: 'good',
      language: 'it',
    });
    expect(again.reps).toBe(2);
    expect(again.lastQuestionId).toBe('q-stack-1');
  });
});

describe('completeReviewSession', () => {
  it('allunga la serie una volta al giorno', async () => {
    const store = new MemoryStore();
    expect((await completeReviewSession(store, clockAt(NOW))).days).toBe(1);
    expect((await completeReviewSession(store, clockAt(NOW))).days).toBe(1);
    expect((await completeReviewSession(store, clockAt(later(1)))).days).toBe(2);
  });
});

describe('planReviewSession', () => {
  it('mette prima i concetti scaduti, dal più in ritardo, con una domanda diversa dall’ultima', () => {
    const stack = applyReview(undefined, id('stack'), 'again', later(-3), 'q-stack-1');
    const queue = applyReview(undefined, id('queue'), 'again', later(-1), 'q-queue-1');
    const tree = applyReview(undefined, id('tree'), 'good', NOW);
    const plan = planReviewSession(concepts, questions, [queue, tree, stack], NOW);
    expect(plan).toEqual([
      { conceptId: id('stack'), questionId: 'q-stack-2', reason: 'due' },
      { conceptId: id('queue'), questionId: 'q-queue-1', reason: 'due' },
    ]);
  });

  it('senza scadenze ripassa in anticipo ciò che si ricorda meno', () => {
    const strong = matured('stack', later(-30), NOW);
    // Stesso concetto maturo, ma con un ricordo debole: scade più avanti e si ricorda meno.
    const weak = {
      ...matured('queue', later(-30), NOW),
      stability: 1,
      lastReview: later(-5).toISOString(),
    };
    const plan = planReviewSession(concepts, questions, [strong, weak], NOW);
    expect(plan.map((item) => item.reason)).toEqual(['early', 'early']);
    expect(plan[0]?.conceptId).toBe(id('queue'));
  });

  it('esclude concetti mai visti, sconosciuti o senza domande e rispetta il limite', () => {
    const lonely = applyReview(undefined, id('lonely'), 'again', later(-1));
    const stranger = applyReview(undefined, id('other'), 'again', later(-1));
    const stack = applyReview(undefined, id('stack'), 'again', later(-1));
    const queue = applyReview(undefined, id('queue'), 'again', later(-2));
    expect(planReviewSession(concepts, questions, [lonely, stranger], NOW)).toEqual([]);
    expect(planReviewSession(concepts, questions, [stack, queue], NOW, 1)).toEqual([
      { conceptId: id('queue'), questionId: 'q-queue-1', reason: 'due' },
    ]);
    expect(planReviewSession(concepts, questions, [], NOW)).toEqual([]);
  });
});

describe('summarizeReview', () => {
  it('conta scaduti, concetti deboli e avanzamento per modulo', () => {
    const stack = applyReview(
      applyReview(undefined, id('stack'), 'again', later(-2)),
      id('stack'),
      'again',
      later(-1),
    );
    const queue = applyReview(undefined, id('queue'), 'again', later(-1));
    const tree = matured('tree', later(-60), NOW);
    const stranger = applyReview(undefined, id('other'), 'again', later(-1));
    const summary = summarizeReview(concepts, [stack, queue, tree, stranger], later(-0.5), 1);
    expect(summary.due).toBe(2);
    expect(summary.weak.map((state) => state.conceptId)).toEqual([id('stack')]);
    expect(summary.chapters).toEqual([
      { chapterIndex: 1, concepts: 2, seen: 2, stable: 0 },
      { chapterIndex: 2, concepts: 2, seen: 1, stable: 1 },
    ]);
  });
});
