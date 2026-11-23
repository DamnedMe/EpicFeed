import { describe, expect, it } from 'vitest';
import { chooseSubject, loadFeed, preferredSubjectId, readCachedFeed } from './feed-client';
import type { KeyValueStore } from './storage';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const subject = (subjectId: string, lessonsWithFeed: number) => ({
  subjectId,
  title: `Materia ${subjectId.slice(0, 1)}`,
  editionLabel: '2024/25',
  lessons: 3,
  lessonsWithFeed,
});
const feed = (version: string) => ({
  subjectId: S2,
  title: 'DSA',
  version: version.repeat(64),
  chapters: [],
});

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

type Route = (init?: RequestInit) => Response | Promise<Response>;
function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const route = routes[url];
    return route ? Promise.resolve(route(init)) : Promise.reject(new TypeError('offline'));
  };
  return { impl, calls };
}

const list = () => Response.json({ subjects: [subject(S1, 0), subject(S2, 4)] });

describe('chooseSubject', () => {
  it('preferisce l’ultima materia se ha lezioni pronte', () => {
    const subjects = [subject(S1, 2), subject(S2, 4)];
    expect(chooseSubject(subjects, S2)?.subjectId).toBe(S2);
    expect(chooseSubject(subjects, null)?.subjectId).toBe(S1);
    expect(chooseSubject([subject(S1, 0)], S1)).toBeNull();
  });
});

describe('loadFeed', () => {
  it('scarica la materia con lezioni pronte e la salva sul dispositivo', async () => {
    const store = memoryStore();
    const { impl } = fakeFetch({
      '/api/feed/subjects': list,
      [`/api/feed/subjects/${S2}`]: () => Response.json(feed('a')),
    });
    const result = await loadFeed(impl, store);
    expect(result).toMatchObject({
      status: 'ready',
      offline: false,
      feed: { version: 'a'.repeat(64) },
    });
    expect(store.data.get('ef:subject')).toBe(JSON.stringify(S2));
    expect(store.data.has(`ef:feed:${S2}`)).toBe(true);
  });

  it('con la copia salvata manda l’ETag e usa la copia sul 304', async () => {
    const store = memoryStore();
    store.data.set(`ef:feed:${S2}`, JSON.stringify(feed('b')));
    const { impl, calls } = fakeFetch({
      '/api/feed/subjects': list,
      [`/api/feed/subjects/${S2}`]: () => new Response(null, { status: 304 }),
    });
    const result = await loadFeed(impl, store, S2);
    expect(result).toMatchObject({ status: 'ready', feed: { version: 'b'.repeat(64) } });
    expect(calls[1]?.init?.headers).toEqual({ 'If-None-Match': `"${'b'.repeat(64)}"` });
  });

  it('senza rete usa la copia salvata, altrimenti errore', async () => {
    const store = memoryStore();
    expect(await loadFeed(fakeFetch({}).impl, store)).toEqual({ status: 'error' });
    store.data.set('ef:subject', JSON.stringify(S2));
    store.data.set(`ef:feed:${S2}`, JSON.stringify(feed('c')));
    expect(await loadFeed(fakeFetch({}).impl, store)).toMatchObject({
      status: 'ready',
      offline: true,
    });
    const halfway = fakeFetch({ '/api/feed/subjects': list });
    expect(await loadFeed(halfway.impl, store)).toMatchObject({ status: 'ready', offline: true });
    const fresh = memoryStore();
    expect(await loadFeed(halfway.impl, fresh)).toEqual({ status: 'error' });
  });

  it('riconosce la sessione scaduta e le materie senza lezioni pronte', async () => {
    const unauthorized = () => new Response(null, { status: 401 });
    expect(
      await loadFeed(fakeFetch({ '/api/feed/subjects': unauthorized }).impl, memoryStore()),
    ).toEqual({
      status: 'unauthorized',
    });
    const late = fakeFetch({
      '/api/feed/subjects': list,
      [`/api/feed/subjects/${S2}`]: unauthorized,
    });
    expect(await loadFeed(late.impl, memoryStore())).toEqual({ status: 'unauthorized' });
    const none = fakeFetch({
      '/api/feed/subjects': () => Response.json({ subjects: [subject(S1, 0)] }),
    });
    expect(await loadFeed(none.impl, memoryStore())).toMatchObject({ status: 'empty' });
    const failing = fakeFetch({ '/api/feed/subjects': () => new Response(null, { status: 500 }) });
    expect(await loadFeed(failing.impl, memoryStore())).toEqual({ status: 'error' });
  });
});

describe('copia sul dispositivo', () => {
  it('sceglie la materia chiesta, altrimenti l’ultima aperta', () => {
    const store = memoryStore();
    expect(preferredSubjectId(store)).toBeNull();
    store.data.set('ef:subject', JSON.stringify(S2));
    expect(preferredSubjectId(store)).toBe(S2);
    expect(preferredSubjectId(store, S1)).toBe(S1);
    expect(preferredSubjectId(null)).toBeNull();
  });

  it('legge e valida la copia una volta sola, poi la tiene in memoria', () => {
    const store = memoryStore();
    expect(readCachedFeed(S2, store)).toBeNull();
    store.data.set(`ef:feed:${S2}`, JSON.stringify(feed('d')));
    const first = readCachedFeed(S2, store);
    expect(first?.version).toBe('d'.repeat(64));
    // Anche se lo spazio cambia sotto, la copia già validata resta la stessa.
    store.data.set(`ef:feed:${S2}`, 'rotto');
    expect(readCachedFeed(S2, store)).toBe(first);
    // Un altro spazio non vede la memoria del primo.
    expect(readCachedFeed(S2, memoryStore())).toBeNull();
  });

  it('una copia corrotta vale come nessuna copia', () => {
    const store = memoryStore();
    store.data.set(`ef:feed:${S2}`, JSON.stringify({ subjectId: S2 }));
    expect(readCachedFeed(S2, store)).toBeNull();
  });

  it('la materia nuova scaricata sostituisce quella in memoria', async () => {
    const store = memoryStore();
    store.data.set(`ef:feed:${S2}`, JSON.stringify(feed('e')));
    expect(readCachedFeed(S2, store)?.version).toBe('e'.repeat(64));
    const { impl } = fakeFetch({
      '/api/feed/subjects': list,
      [`/api/feed/subjects/${S2}`]: () => Response.json(feed('f')),
    });
    await loadFeed(impl, store, S2);
    expect(readCachedFeed(S2, store)?.version).toBe('f'.repeat(64));
  });
});
