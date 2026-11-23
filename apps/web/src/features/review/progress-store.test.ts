import { IDBFactory } from 'fake-indexeddb';
import { applyReview, completeReviewSession, recordAnswer } from '@study-feed/core';
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
