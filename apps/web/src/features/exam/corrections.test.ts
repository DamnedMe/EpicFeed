import { describe, expect, it, vi } from 'vitest';
import type { StoredSubmissionResponse } from '@epicfeed/exam';
import type { LocalValue } from '../feed/local-state';
import type { ExamExerciseItem } from './catalog';
import type { CorrectionEntry } from './corrections';
import {
  answersFromCorrection,
  latestFor,
  MAX_CORRECTION_ENTRIES,
  mergeSubmissions,
  scoresFromCorrection,
  submissionItemFor,
  submitForCorrection,
  syncCorrections,
  trimEntries,
} from './corrections';

const subjectId = '40000000-0000-4000-8000-000000000001';
const uuid = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const exercise: ExamExerciseItem = {
  key: 'bank:dfs',
  title: 'DFS',
  group: 'official',
  context: 'Page 1',
  kind: 'code',
  prompt: 'Write visit(graph, start).',
  code: null,
  signature: 'def visit(graph, start):',
  tests: [],
  hints: [],
  modelAnswer: 'def visit(graph, start): ...',
  rubric: [
    { criterion: 'Correct', points: 3 },
    { criterion: 'Complexity', points: 2 },
  ],
  conceptKeys: ['dfs', 'graph'],
  followUp: 'Why a stack?',
};

function stored(n: number, corrected: boolean, createdAt = `2026-11-24T10:0${n}:00.000Z`) {
  const submission = {
    subjectId,
    kind: 'exercise' as const,
    items: [submissionItemFor(exercise, 'def visit(graph, start):\n    return []')],
  };
  return {
    id: uuid(n),
    subjectId,
    kind: 'exercise',
    submission,
    correction: corrected
      ? {
          summary: 'Ok.',
          items: [{ key: exercise.key, scores: [3, 1], comment: 'Fine.', suggestions: [] }],
        }
      : null,
    createdAt,
    correctedAt: corrected ? createdAt : null,
  } satisfies StoredSubmissionResponse;
}

/** Valore locale in memoria. */
function memoryValue(initial: CorrectionEntry[] = []): LocalValue<CorrectionEntry[]> {
  let value = initial;
  return {
    fallback: [],
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? next(value) : next;
    },
    subscribe: () => () => {},
  };
}

describe('submissionItemFor', () => {
  it('include l’approfondimento solo se c’è la risposta', () => {
    expect(submissionItemFor(exercise, 'a').followUp).toBeNull();
    const item = submissionItemFor(exercise, 'a', {
      followUpAnswer: 'LIFO',
      tests: { passed: 1, total: 2 },
    });
    expect(item).toMatchObject({ followUp: 'Why a stack?', followUpAnswer: 'LIFO' });
    expect(item.tests).toEqual({ passed: 1, total: 2 });
  });
});

describe('mergeSubmissions', () => {
  it('porta le correzioni, toglie gli scaduti e aggiunge gli invii di altri dispositivi', () => {
    const local: CorrectionEntry[] = [
      { ...stored(1, false), recorded: false },
      { ...stored(2, false), recorded: false },
      { ...stored(3, true), recorded: true },
    ];
    const merged = mergeSubmissions(local, [stored(1, true), stored(4, false)]);
    expect(merged.map((entry) => entry.id)).toEqual([uuid(4), uuid(3), uuid(1)]);
    expect(merged.find((entry) => entry.id === uuid(1))?.correction).not.toBeNull();
    expect(merged.find((entry) => entry.id === uuid(3))?.recorded).toBe(true);
  });

  it('tiene al massimo gli invii previsti, senza togliere quelli in attesa', () => {
    const many = Array.from({ length: MAX_CORRECTION_ENTRIES + 5 }, (_, i) => ({
      ...stored(i, i > 0, `2026-11-24T10:00:${String(59 - i).padStart(2, '0')}.000Z`),
      recorded: true,
    }));
    const trimmed = trimEntries(many);
    expect(trimmed).toHaveLength(MAX_CORRECTION_ENTRIES);
    expect(trimmed[0]?.correction).toBeNull();
  });
});

describe('dalla correzione al ripasso', () => {
  it('una valutazione per concetto e il punteggio dell’esercizio', () => {
    const entry = { ...stored(1, true), recorded: false };
    const answers = answersFromCorrection(entry);
    expect(answers.map((a) => a.conceptKey)).toEqual(['dfs', 'graph']);
    expect(answers[0]).toMatchObject({ source: 'exercise', grade: 'hard', language: 'en' });
    expect(scoresFromCorrection(entry)).toEqual({ [exercise.key]: 0.8 });
    expect(answersFromCorrection({ ...stored(2, false), recorded: false })).toEqual([]);
    expect(latestFor([entry], exercise.key)?.id).toBe(uuid(1));
  });
});

describe('submitForCorrection', () => {
  const draft = stored(1, false).submission;

  it('conserva l’invio in attesa sul dispositivo', async () => {
    const store = memoryValue();
    const outcome = await submitForCorrection(
      () => Promise.resolve(Response.json({ id: uuid(7) }, { status: 201 })),
      draft,
      store,
      () => new Date('2026-11-24T12:00:00.000Z'),
    );
    expect(outcome).toEqual({ status: 'sent', id: uuid(7) });
    expect(store.get()[0]).toMatchObject({ id: uuid(7), correction: null, recorded: false });
  });

  it('riporta il limite, la sessione scaduta e gli errori di rete', async () => {
    const store = memoryValue();
    const limit = await submitForCorrection(
      () => Promise.resolve(Response.json({ error: { message: 'Troppe' } }, { status: 409 })),
      draft,
      store,
    );
    expect(limit).toEqual({ status: 'limit', message: 'Troppe' });
    const anonymous = await submitForCorrection(
      () => Promise.resolve(new Response(null, { status: 401 })),
      draft,
      store,
    );
    expect(anonymous.status).toBe('unauthorized');
    expect(
      (await submitForCorrection(() => Promise.reject(new Error('x')), draft, store)).status,
    ).toBe('error');
    expect(store.get()).toEqual([]);
  });
});

describe('syncCorrections', () => {
  it('registra una volta sola, salva i punteggi e cancella gli invii corretti', async () => {
    const store = memoryValue([{ ...stored(1, false), recorded: false }]);
    const record = vi.fn(() => Promise.resolve(true));
    const saveScores = vi.fn();
    const calls: string[] = [];
    const fetchImpl = (input: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${input}`);
      return Promise.resolve(
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : Response.json({ submissions: [stored(1, true)] }),
      );
    };
    expect(await syncCorrections({ fetch: fetchImpl, store, record, saveScores })).toBe(1);
    expect(record).toHaveBeenCalledTimes(2);
    expect(saveScores).toHaveBeenCalledWith({ [exercise.key]: 0.8 });
    expect(store.get()[0]?.recorded).toBe(true);
    expect(calls).toContain(`DELETE /api/exam/submissions/${uuid(1)}`);

    // Se la cancellazione non era riuscita, il secondo giro non registra di nuovo.
    expect(await syncCorrections({ fetch: fetchImpl, store, record, saveScores })).toBe(0);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('senza rete non tocca niente', async () => {
    const store = memoryValue([{ ...stored(1, false), recorded: false }]);
    const result = await syncCorrections({
      fetch: () => Promise.reject(new Error('offline')),
      store,
      record: vi.fn(),
      saveScores: vi.fn(),
    });
    expect(result).toBe(0);
    expect(store.get()).toHaveLength(1);
  });
});
