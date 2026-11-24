import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredProgress } from '@epicfeed/core';
import { recordAnswer, systemClock } from '@epicfeed/core';
import { progressStore } from '../review/progress-store';
import { decryptSnapshot, derivePasswordKey } from './crypto';
import { currentSyncStatus, forgetPasswordKey, rememberPasswordKey, syncNow } from './engine';
import { syncKeyStore } from './key-store';

const ANNA = '0a0a0a0a-0000-4000-8000-00000000000a';
const BRUNO = '0b0b0b0b-0000-4000-8000-00000000000b';
const EMAIL = 'anna@example.com';
const PASSWORD = 'una password lunga';

/** Server in memoria con la stessa API di `/api/progress`. */
let stored: StoredProgress | null = null;
let offline = false;

function fakeFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (offline) return Promise.reject(new TypeError('Failed to fetch'));
  if (!init?.method || init.method === 'GET') {
    return Promise.resolve(
      stored ? Response.json(stored) : Response.json({ error: {} }, { status: 404 }),
    );
  }
  const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as StoredProgress & {
    baseRevision: number | null;
  };
  if ((stored?.revision ?? null) !== body.baseRevision) {
    return Promise.resolve(Response.json({ error: {} }, { status: 409 }));
  }
  stored = {
    kdf: body.kdf,
    salt: body.salt,
    iv: body.iv,
    ciphertext: body.ciphertext,
    revision: (stored?.revision ?? 0) + 1,
  };
  return Promise.resolve(Response.json({ revision: stored.revision }));
}

async function answer(conceptKey: string) {
  const store = await progressStore();
  if (!store) throw new Error('IndexedDB');
  await recordAnswer(store, systemClock, {
    subjectId: 's1',
    conceptKey,
    questionId: null,
    source: 'feed',
    grade: 'good',
    language: 'en',
  });
}

/** Cookie scritti dall'app (il segnale della chiave per il server). */
let cookies: string[] = [];

beforeEach(() => {
  vi.stubGlobal('fetch', fakeFetch);
  cookies = [];
  vi.stubGlobal('window', { location: { protocol: 'http:' } });
  vi.stubGlobal('document', {
    set cookie(value: string) {
      cookies.push(value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sincronizzazione dei progressi', () => {
  it('senza chiave chiede la password e non chiama il server', async () => {
    const spy = vi.fn(fakeFetch);
    vi.stubGlobal('fetch', spy);
    expect(await syncNow(ANNA)).toEqual({ state: 'nokey' });
    expect(spy).not.toHaveBeenCalled();
    expect(cookies.at(-1)).toMatch(/^ef-sync-key=; .*Max-Age=0/);
  });

  it('con la chiave dell’accesso cifra e manda i progressi', async () => {
    await answer('stack');
    expect(await rememberPasswordKey(EMAIL, PASSWORD)).toBe(true);
    const status = await syncNow(ANNA);
    expect(status.state).toBe('synced');
    expect(currentSyncStatus()).toEqual(status);
    expect(cookies.at(-1)).toMatch(/^ef-sync-key=1; /);
    expect(stored?.revision).toBe(1);
    expect(stored?.ciphertext).not.toContain('stack');
    const key = await derivePasswordKey(EMAIL, PASSWORD);
    const snapshot = stored ? await decryptSnapshot(key, stored) : null;
    expect(snapshot?.answers.map((item) => item.conceptId)).toEqual(['s1:stack']);
    // La chiave ora è legata ad Anna e non più "appena verificata".
    const record = await (await syncKeyStore())?.loadKey();
    expect(record?.account).toBe(ANNA);
    expect(record?.trusted).toBe(false);
  });

  it('riceve le risposte date su un altro dispositivo', async () => {
    const key = await derivePasswordKey(EMAIL, PASSWORD);
    const current = stored ? await decryptSnapshot(key, stored) : null;
    if (!current || !stored) throw new Error('copia');
    const { encryptSnapshot } = await import('./crypto');
    const fromPc = {
      ...current,
      answers: [
        ...current.answers,
        {
          conceptId: 's1:queue',
          questionId: null,
          source: 'review' as const,
          grade: 'again' as const,
          language: 'it' as const,
          at: '2026-11-01T08:00:00.000Z',
        },
      ],
    };
    stored = { ...(await encryptSnapshot(key, fromPc)), revision: stored.revision + 1 };
    expect((await syncNow(ANNA)).state).toBe('synced');
    const store = await progressStore();
    expect((await store?.getReview('s1:queue'))?.wrong).toBe(1);
  });

  it('con una password cambiata altrove si blocca invece di sovrascrivere', async () => {
    const other = await derivePasswordKey(EMAIL, 'la password nuova');
    const { encryptSnapshot } = await import('./crypto');
    const before = stored;
    stored = {
      ...(await encryptSnapshot(other, { version: 1, answers: [], reviewDays: [], bestStreak: 0 })),
      revision: (before?.revision ?? 0) + 1,
    };
    const locked = stored;
    expect(await syncNow(ANNA)).toEqual({ state: 'locked' });
    expect(stored).toBe(locked);
    // Sbloccata con la password nuova, unisce.
    await rememberPasswordKey(EMAIL, 'la password nuova', ANNA);
    expect((await syncNow(ANNA)).state).toBe('synced');
    expect(stored.revision).toBe(locked.revision + 1);
  });

  it('senza rete resta in attesa', async () => {
    await answer('tree');
    offline = true;
    expect(await syncNow(ANNA)).toEqual({ state: 'offline' });
    offline = false;
  });

  it('un altro account sullo stesso browser non eredita i progressi', async () => {
    expect(await syncNow(BRUNO)).toEqual({ state: 'nokey' });
    const store = await progressStore();
    expect(await store?.loadReviews()).toEqual([]);
    await forgetPasswordKey();
    expect(await (await syncKeyStore())?.loadKey()).toBeNull();
  });
});
