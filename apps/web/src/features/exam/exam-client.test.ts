import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../feed/storage';
import { loadExamContent, readCachedExam } from './exam-client';

const subjectId = '00000000-0000-4000-8000-000000000001';
const content = { subjectId, version: 'b'.repeat(64), packs: [], bank: null };

/** Spazio dei dati in memoria. */
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('loadExamContent', () => {
  it('scarica, valida e conserva la copia; poi manda l’ETag', async () => {
    const store = memoryStore();
    const first = await loadExamContent(
      () => Promise.resolve(Response.json(content)),
      subjectId,
      store,
    );
    expect(first).toEqual({ status: 'ready', content, offline: false });
    expect(readCachedExam(subjectId, store)).toEqual(content);

    let sent: HeadersInit | undefined;
    const second = await loadExamContent(
      (_input, init) => {
        sent = init?.headers;
        return Promise.resolve(new Response(null, { status: 304 }));
      },
      subjectId,
      store,
    );
    expect(sent).toEqual({ 'If-None-Match': `"${content.version}"` });
    expect(second).toEqual({ status: 'ready', content, offline: false });
  });

  it('senza rete usa la copia; senza copia è un errore', async () => {
    const store = memoryStore();
    const offline = () => Promise.reject(new Error('offline'));
    expect(await loadExamContent(offline, subjectId, store)).toEqual({ status: 'error' });
    await loadExamContent(() => Promise.resolve(Response.json(content)), subjectId, store);
    expect(await loadExamContent(offline, subjectId, store)).toEqual({
      status: 'ready',
      content,
      offline: true,
    });
  });

  it('401 chiede l’accesso; una risposta non valida non sostituisce la copia', async () => {
    const store = memoryStore();
    expect(
      await loadExamContent(
        () => Promise.resolve(new Response(null, { status: 401 })),
        subjectId,
        store,
      ),
    ).toEqual({ status: 'unauthorized' });
    expect(
      await loadExamContent(
        () => Promise.resolve(Response.json({ ...content, version: 'x' })),
        subjectId,
        store,
      ),
    ).toEqual({ status: 'error' });
    expect(store.data.size).toBe(0);
  });
});
