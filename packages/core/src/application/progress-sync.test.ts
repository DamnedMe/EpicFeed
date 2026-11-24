import { describe, expect, it } from 'vitest';
import { applyReview } from '../domain/review.js';
import type {
  ProgressSnapshot,
  ProgressVault,
  PushResult,
  RemoteProgress,
  SyncableProgressStore,
} from './progress-sync.js';
import {
  addsToSnapshot,
  answerKey,
  EMPTY_SNAPSHOT,
  MAX_REVIEW_DAYS,
  mergeSnapshots,
  replayAnswers,
  streakFromDays,
  syncProgress,
} from './progress-sync.js';
import type { AnswerRecord } from './review.js';

const answer = (
  at: string,
  concept: string,
  grade: AnswerRecord['grade'] = 'good',
  questionId: string | null = null,
): AnswerRecord => ({
  conceptId: concept,
  questionId,
  source: 'feed',
  grade,
  language: 'en',
  at,
});

const snap = (
  answers: AnswerRecord[],
  reviewDays: string[] = [],
  bestStreak = 0,
): ProgressSnapshot => ({ version: 1, answers, reviewDays, bestStreak });

const A1 = answer('2026-11-20T10:00:00.000Z', 's:stack', 'again', 'q1');
const A2 = answer('2026-11-21T10:00:00.000Z', 's:stack', 'good', 'q2');
const B1 = answer('2026-11-20T12:00:00.000Z', 's:queue');

describe('mergeSnapshots', () => {
  it('unisce risposte senza doppioni, in ordine di tempo, e i giorni', () => {
    const merged = mergeSnapshots(
      snap([A2, A1], ['2026-11-21'], 1),
      snap([B1, A1], ['2026-11-20', '2026-11-21'], 0),
    );
    expect(merged.answers).toEqual([A1, B1, A2]);
    expect(merged.reviewDays).toEqual(['2026-11-20', '2026-11-21']);
    expect(merged.bestStreak).toBe(2);
  });

  it('dà lo stesso risultato in qualunque ordine e tiene la serie migliore più alta', () => {
    const a = snap([A1, B1], [], 9);
    const b = snap([A2]);
    expect(mergeSnapshots(a, b)).toEqual(mergeSnapshots(b, a));
    expect(mergeSnapshots(a, b).bestStreak).toBe(9);
  });

  it('ordina per chiave le risposte nello stesso istante', () => {
    const x = answer('2026-11-20T10:00:00.000Z', 's:b');
    const y = answer('2026-11-20T10:00:00.000Z', 's:a');
    expect(mergeSnapshots(snap([x]), snap([y])).answers).toEqual([y, x]);
    expect(mergeSnapshots(snap([x, x]), EMPTY_SNAPSHOT).answers).toEqual([x]);
  });

  it('conserva al massimo gli ultimi giorni di ripasso', () => {
    const days = Array.from({ length: MAX_REVIEW_DAYS + 5 }, (_, index) => {
      const date = new Date(Date.UTC(2025, 0, 1 + index));
      return date.toISOString().slice(0, 10);
    });
    const merged = mergeSnapshots(snap([], days), EMPTY_SNAPSHOT);
    expect(merged.reviewDays).toHaveLength(MAX_REVIEW_DAYS);
    expect(merged.reviewDays[0]).toBe(days[5]);
  });
});

describe('addsToSnapshot', () => {
  it('vede risposte, giorni o serie migliore in più', () => {
    const base = snap([A1], ['2026-11-20'], 1);
    expect(addsToSnapshot(base, base)).toBe(false);
    expect(addsToSnapshot(snap([A1, A2], ['2026-11-20'], 1), base)).toBe(true);
    expect(addsToSnapshot(snap([A1], ['2026-11-20', '2026-11-21'], 1), base)).toBe(true);
    expect(addsToSnapshot(snap([A1], ['2026-11-20'], 3), base)).toBe(true);
  });
});

describe('replayAnswers', () => {
  it('ricalcola gli stati come le risposte date una alla volta', () => {
    const first = applyReview(undefined, 's:stack', 'again', new Date(A1.at), 'q1');
    const second = applyReview(first, 's:stack', 'good', new Date(A2.at), 'q2');
    const states = replayAnswers([A2, B1, A1]);
    expect(states.find((state) => state.conceptId === 's:stack')).toEqual(second);
    expect(states.find((state) => state.conceptId === 's:queue')?.reps).toBe(1);
    expect(replayAnswers([])).toEqual([]);
  });
});

describe('streakFromDays', () => {
  it('calcola la serie finale e la migliore', () => {
    expect(streakFromDays([])).toEqual({ lastDay: null, days: 0, best: 0 });
    expect(
      streakFromDays(['2026-11-03', '2026-11-01', '2026-11-02', '2026-11-02', '2026-11-10']),
    ).toEqual({ lastDay: '2026-11-10', days: 1, best: 3 });
    expect(streakFromDays(['2026-11-10'], 7).best).toBe(7);
  });
});

describe('answerKey', () => {
  it('distingue fonte e domanda', () => {
    expect(answerKey(A1)).not.toBe(answerKey({ ...A1, source: 'review' }));
    expect(answerKey({ ...A1, questionId: null })).toBe(`${A1.at}|s:stack|feed|`);
  });
});

/** Dispositivo in memoria. */
class MemoryStore implements SyncableProgressStore {
  constructor(public snapshot: ProgressSnapshot = EMPTY_SNAPSHOT) {}
  loadSnapshot() {
    return Promise.resolve(this.snapshot);
  }
  mergeSnapshot(remote: ProgressSnapshot) {
    this.snapshot = mergeSnapshots(this.snapshot, remote);
    return Promise.resolve(this.snapshot);
  }
}

/** Server in memoria; `readable: false` simula una chiave diversa. */
class MemoryVault implements ProgressVault {
  revision = 0;
  stored: ProgressSnapshot | null = null;
  readable = true;
  pushes = 0;
  /** Scritture concorrenti da simulare prima della prossima `push`. */
  racing = 0;
  pull(): Promise<RemoteProgress | null> {
    if (!this.stored) return Promise.resolve(null);
    return Promise.resolve({
      revision: this.revision,
      snapshot: this.readable ? this.stored : 'unreadable',
    });
  }
  push(snapshot: ProgressSnapshot, baseRevision: number | null): Promise<PushResult> {
    this.pushes += 1;
    if (this.racing > 0) {
      this.racing -= 1;
      this.stored = mergeSnapshots(this.stored ?? EMPTY_SNAPSHOT, snap([B1]));
      this.revision += 1;
      return Promise.resolve({ ok: false });
    }
    if ((this.stored ? this.revision : null) !== baseRevision) {
      return Promise.resolve({ ok: false });
    }
    this.stored = snapshot;
    this.readable = true;
    this.revision += 1;
    return Promise.resolve({ ok: true, revision: this.revision });
  }
}

describe('syncProgress', () => {
  it('non scrive niente se dispositivo e server sono vuoti', async () => {
    const vault = new MemoryVault();
    expect(await syncProgress(new MemoryStore(), vault)).toEqual({
      status: 'synced',
      revision: null,
      pulled: false,
    });
    expect(vault.pushes).toBe(0);
  });

  it('crea la copia sul server dal primo dispositivo', async () => {
    const vault = new MemoryVault();
    const outcome = await syncProgress(new MemoryStore(snap([A1])), vault);
    expect(outcome).toEqual({ status: 'synced', revision: 1, pulled: false });
    expect(vault.stored?.answers).toEqual([A1]);
  });

  it('unisce i due dispositivi e riscrive solo se serve', async () => {
    const vault = new MemoryVault();
    const phone = new MemoryStore(snap([A1]));
    const pc = new MemoryStore(snap([A2]));
    await syncProgress(phone, vault);
    expect(await syncProgress(pc, vault)).toEqual({ status: 'synced', revision: 2, pulled: true });
    expect(pc.snapshot.answers).toEqual([A1, A2]);
    expect(await syncProgress(phone, vault)).toEqual({
      status: 'synced',
      revision: 2,
      pulled: true,
    });
    expect(phone.snapshot.answers).toEqual([A1, A2]);
    expect(vault.pushes).toBe(2);
  });

  it('con una copia che non si decifra si ferma, oppure la rifà se la chiave è appena verificata', async () => {
    const vault = new MemoryVault();
    await syncProgress(new MemoryStore(snap([A1])), vault);
    vault.readable = false;
    const device = new MemoryStore(snap([A2]));
    expect(await syncProgress(device, vault)).toEqual({ status: 'locked' });
    expect(await syncProgress(device, vault, { replaceUnreadable: true })).toEqual({
      status: 'synced',
      revision: 2,
      pulled: false,
    });
    expect(vault.stored?.answers).toEqual([A2]);
  });

  it('riprova se un altro dispositivo scrive nello stesso momento', async () => {
    const vault = new MemoryVault();
    vault.racing = 1;
    const device = new MemoryStore(snap([A1]));
    const outcome = await syncProgress(device, vault);
    expect(outcome.status).toBe('synced');
    expect(vault.stored?.answers).toEqual([A1, B1]);
    expect(device.snapshot.answers).toEqual([A1, B1]);
  });

  it('rinuncia dopo troppi conflitti', async () => {
    const vault = new MemoryVault();
    vault.racing = 3;
    expect(await syncProgress(new MemoryStore(snap([A1])), vault)).toEqual({ status: 'busy' });
  });
});
