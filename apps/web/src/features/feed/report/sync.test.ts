import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import type { CorrectionDraft, StoredCorrection } from '@epicfeed/feed';
import type { CorrectionsState } from './sync';
import {
  activeCorrections,
  addLocal,
  EMPTY_CORRECTIONS,
  mergeSync,
  newCorrection,
  randomId,
  syncCorrections,
  withdrawLocal,
} from './sync';

const subjectId = '40000000-0000-4000-8000-000000000001';
const lessonId = '10000000-0000-4000-8000-000000000001';
const id = (n: number) => `60000000-0000-4000-8000-00000000000${n}`;
const draft: CorrectionDraft = {
  kind: 'text',
  lessonId,
  itemType: 'card',
  itemId: 'stack-rule',
  edits: [{ field: 'keyPoint', language: 'it', original: 'FIFO', corrected: 'LIFO' }],
  reason: 'content',
  snapshot: {},
};
const at = (n: number) => new Date(`2026-11-25T10:00:0${n}.000Z`);
const correction = (n: number): StoredCorrection => newCorrection(id(n), subjectId, draft, at(n));

type Route = (init?: RequestInit) => Response;
function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    return route ? Promise.resolve(route(init)) : Promise.reject(new TypeError('offline'));
  };
  return { impl, calls };
}
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('stato locale', () => {
  it('aggiunge, ordina e annulla', () => {
    let state = addLocal(EMPTY_CORRECTIONS, correction(2));
    state = addLocal(state, correction(1));
    expect(activeCorrections(state).map((c) => c.id)).toEqual([id(1), id(2)]);
    expect(state.items[0]?.correction.claudeStatus).toBe('pending');
    // Mai inviata: basta toglierla.
    expect(withdrawLocal(state, id(1)).withdrawn).toEqual([]);
    const sent: CorrectionsState = {
      items: [{ correction: correction(3), unsent: false }],
      withdrawn: [],
    };
    expect(withdrawLocal(sent, id(3))).toEqual({ items: [], withdrawn: [id(3)] });
    expect(withdrawLocal(sent, id(9))).toBe(sent);
  });
});

describe('syncCorrections e mergeSync', () => {
  it('invia, cancella e sostituisce con l’elenco del server', async () => {
    const remote = { ...correction(4), claudeStatus: 'done' as const };
    let state = addLocal(EMPTY_CORRECTIONS, correction(1));
    state = { ...state, withdrawn: [id(5)] };
    const { impl, calls } = fakeFetch({
      'POST /api/corrections': () => json({ correction: correction(1) }, 201),
      [`DELETE /api/corrections/${id(5)}`]: () => new Response(null, { status: 204 }),
      'GET /api/corrections': () => json({ corrections: [correction(1), remote] }),
    });
    const result = await syncCorrections(state, impl, () => id(9));
    expect(result.status).toBe('ok');
    expect(calls).toEqual([
      'POST /api/corrections',
      `DELETE /api/corrections/${id(5)}`,
      'GET /api/corrections',
    ]);
    // Nel frattempo lo studente ha fatto un'altra correzione.
    const merged = mergeSync(addLocal(state, correction(2)), result);
    expect(merged.withdrawn).toEqual([]);
    expect(merged.items.map((i) => [i.correction.id, i.unsent])).toEqual([
      [id(1), false],
      [id(4), false],
      [id(2), true],
    ]);
  });

  it('offline non perde nulla; 409 cambia id, 400 scarta', async () => {
    let state = addLocal(EMPTY_CORRECTIONS, correction(1));
    state = addLocal(state, correction(2));
    const offline = await syncCorrections(state, fakeFetch({}).impl, () => id(9));
    expect(offline.status).toBe('offline');
    expect(mergeSync(state, offline)).toEqual(state);

    let n = 0;
    const { impl } = fakeFetch({
      'POST /api/corrections': () => (n++ === 0 ? json({}, 409) : json({}, 400)),
      'GET /api/corrections': () => json({}, 500),
    });
    const result = await syncCorrections(state, impl, () => id(9));
    const merged = mergeSync(state, result);
    expect(merged.items.map((i) => [i.correction.id, i.unsent])).toEqual([[id(9), true]]);
  });

  it('annullata mentre veniva inviata: la si cancella anche sul server', async () => {
    const state = addLocal(EMPTY_CORRECTIONS, correction(1));
    const { impl } = fakeFetch({
      'POST /api/corrections': () => json({ correction: correction(1) }, 201),
      'GET /api/corrections': () => json({ corrections: [correction(1)] }),
    });
    const result = await syncCorrections(state, impl, () => id(9));
    const merged = mergeSync(withdrawLocal(state, id(1)), result);
    expect(merged).toEqual({ items: [], withdrawn: [id(1)] });
  });

  it('sessione scaduta', async () => {
    const state = addLocal(EMPTY_CORRECTIONS, correction(1));
    const { impl } = fakeFetch({ 'POST /api/corrections': () => json({}, 401) });
    expect((await syncCorrections(state, impl, () => id(9))).status).toBe('unauthorized');
    const empty = fakeFetch({ 'GET /api/corrections': () => json({}, 401) });
    expect((await syncCorrections(EMPTY_CORRECTIONS, empty.impl, () => id(9))).status).toBe(
      'unauthorized',
    );
  });
});

describe('randomId', () => {
  it('usa randomUUID se c’è, altrimenti compone un UUID v4', () => {
    const fill = <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) array.fill(255);
      return array;
    };
    expect(
      randomId({ randomUUID: () => 'a-b-c-d-e-f-0-0-0-0', getRandomValues: fill } as never),
    ).toBe('a-b-c-d-e-f-0-0-0-0');
    const id = randomId({ getRandomValues: fill });
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(z.uuid().safeParse(id).success).toBe(true);
  });
});
