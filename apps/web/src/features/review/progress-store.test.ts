import { IDBFactory } from 'fake-indexeddb';
import { applyReview, completeReviewSession, recordAnswer } from '@epicfeed/review';
import { describe, expect, it } from 'vitest';
import { IndexedDbProgressStore, openProgressDb } from './progress-store';

const NOW = new Date('2026-11-23T10:00:00Z');
const clock = { now: () => NOW };

async function freshStore() {
  return new IndexedDbProgressStore(await openProgressDb(new IDBFactory()));
}

describe('IndexedDbProgressStore', () => {
  it('salva stato e risposta insieme e li rilegge', async () => {
    const store = await freshStore();
    const state = await recordAnswer(store, clock, {
      subjectId: 's1',
      conceptKey: 'stack',
      questionId: 'l1:quiz:q1',
      source: 'feed',
      grade: 'again',
      language: 'en',
    });
    expect(await store.getReview('s1:stack')).toEqual(state);
    expect(await store.loadReviews()).toEqual([state]);
    expect(await store.countAnswers()).toBe(1);
    expect(await store.getReview('s1:missing')).toBeUndefined();
  });

  it('ignora i record corrotti', async () => {
    const db = await openProgressDb(new IDBFactory());
    const store = new IndexedDbProgressStore(db);
    const good = applyReview(undefined, 's1:ok', 'good', NOW);
    await store.saveAnswer(good, {
      conceptId: good.conceptId,
      questionId: null,
      source: 'review',
      grade: 'good',
      language: 'it',
      at: NOW.toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('reviews', 'readwrite');
      transaction.objectStore('reviews').put({ conceptId: 's1:broken', due: 42 });
      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = () => {
        reject(new Error('scrittura'));
      };
    });
    expect((await store.loadReviews()).map((state) => state.conceptId)).toEqual(['s1:ok']);
    expect(await store.getReview('s1:broken')).toBeUndefined();
  });

  it('conserva la serie di giorni e la cancella con clear', async () => {
    const store = await freshStore();
    expect(await store.loadDayStreak()).toEqual({ lastDay: null, days: 0, best: 0 });
    await completeReviewSession(store, clock);
    expect((await store.loadDayStreak()).days).toBe(1);
    await store.clear();
    expect(await store.loadDayStreak()).toEqual({ lastDay: null, days: 0, best: 0 });
    expect(await store.loadReviews()).toEqual([]);
  });
});

describe('IndexedDbProgressStore e sincronizzazione', () => {
  const answer = (at: string, concept: string, grade: 'again' | 'good' = 'good') => ({
    conceptId: concept,
    questionId: null,
    source: 'feed' as const,
    grade,
    language: 'en' as const,
    at,
  });

  it('esporta risposte, giorni di ripasso e serie migliore', async () => {
    const store = await freshStore();
    await recordAnswer(store, clock, {
      subjectId: 's1',
      conceptKey: 'stack',
      questionId: null,
      source: 'feed',
      grade: 'good',
      language: 'it',
    });
    await completeReviewSession(store, clock);
    const snapshot = await store.loadSnapshot();
    expect(snapshot.answers).toHaveLength(1);
    expect(snapshot.reviewDays).toEqual(['2026-11-23']);
    expect(snapshot.bestStreak).toBe(1);
    // Lo stesso giorno non si ripete.
    await completeReviewSession(store, clock);
    expect((await store.loadSnapshot()).reviewDays).toEqual(['2026-11-23']);
  });

  it('unisce una copia remota e ricalcola stati e serie', async () => {
    const store = await freshStore();
    const local = answer('2026-11-22T09:00:00.000Z', 's1:stack', 'again');
    await store.saveAnswer(applyReview(undefined, 's1:stack', 'again', new Date(local.at)), local);
    const remote = answer('2026-11-23T09:00:00.000Z', 's1:stack');
    const merged = await store.mergeSnapshot({
      version: 1,
      answers: [remote, local],
      reviewDays: ['2026-11-21', '2026-11-22'],
      bestStreak: 5,
    });
    expect(merged.answers).toEqual([local, remote]);
    expect(await store.countAnswers()).toBe(2);
    const state = await store.getReview('s1:stack');
    expect(state?.reps).toBe(2);
    expect(state?.wrong).toBe(1);
    expect(await store.loadDayStreak()).toEqual({ lastDay: '2026-11-22', days: 2, best: 5 });
    expect((await store.loadSnapshot()).reviewDays).toEqual(['2026-11-21', '2026-11-22']);
  });

  it('nella copia porta anche la serie di prima della sincronizzazione', async () => {
    const store = await freshStore();
    await store.saveDayStreak({ lastDay: '2026-11-20', days: 3, best: 4 });
    const snapshot = await store.loadSnapshot();
    expect(snapshot.reviewDays).toEqual(['2026-11-20']);
    expect(snapshot.bestStreak).toBe(4);
  });
});
