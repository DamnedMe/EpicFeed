import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, EpicFeedApi } from './api-client.js';

const token = `sfg_${'A'.repeat(43)}`;
const lessonId = '10000000-0000-4000-8000-000000000001';

function api(response: Response | Error) {
  const fetchMock = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  return {
    client: new EpicFeedApi({
      baseUrl: 'https://app.test',
      token,
      fetch: fetchMock as unknown as typeof fetch,
    }),
    fetchMock,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('EpicFeedApi', () => {
  it('rifiuta indirizzi non HTTPS, tranne localhost', () => {
    expect(() => new EpicFeedApi({ baseUrl: 'http://example.com', token })).toThrow(/HTTPS/);
    expect(() => new EpicFeedApi({ baseUrl: 'http://localhost:3000', token })).not.toThrow();
  });

  it('manda il token solo nell’header e valida la risposta', async () => {
    const body = { lessons: [], totals: { lessons: 0, ready: 0, toGenerate: 0 } };
    const { client, fetchMock } = api(json(body));
    expect(await client.listLessons(5)).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://app.test/api/generation/lessons?limit=5');
    expect(String(url)).not.toContain(token);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${token}`);
    expect(init?.redirect).toBe('error');
  });

  it('invia il feed come JSON', async () => {
    const saved = { feedId: lessonId, created: true, cards: 3, alignedCards: 1 };
    const { client, fetchMock } = api(json(saved, 201));
    const request = {
      lessonId,
      sourcesHash: 'a'.repeat(64),
      promptVersion: '2026-11-21.1',
      feed: { cards: [], quiz: [], concepts: [], glossary: [] },
    };
    expect(await client.saveFeed(request)).toEqual(saved);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://app.test/api/generation/lessons/${lessonId}/feed`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual(request);
  });

  it('trasforma gli errori dell’API, con i problemi del feed', async () => {
    const issues = [{ path: 'quiz', message: 'Servono domande' }];
    const { client } = api(json({ error: { code: 'INVALID_FEED', message: 'No', issues } }, 422));
    const error = (await client.readLesson(lessonId).catch((e: unknown) => e)) as ApiRequestError;
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 422, code: 'INVALID_FEED', issues });
  });

  it('gestisce errori senza corpo, risposte inattese e rete assente', async () => {
    await expect(
      api(new Response('x', { status: 502 })).client.listLessons(1),
    ).rejects.toMatchObject({
      code: 'HTTP',
      status: 502,
    });
    await expect(api(json({ strano: true })).client.listLessons(1)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
    await expect(api(new Error('offline')).client.listLessons(1)).rejects.toMatchObject({
      code: 'NETWORK',
      status: 0,
    });
  });

  it('legge e salva i pacchetti d’esame sugli indirizzi giusti', async () => {
    const list = { lessons: [], totals: { lessons: 0, ready: 0, toGenerate: 0 } };
    const first = api(json(list));
    expect(await first.client.listExamLessons(3)).toEqual(list);
    expect(String(first.fetchMock.mock.calls[0]?.[0])).toBe(
      'https://app.test/api/generation/exam?limit=3',
    );

    const material = {
      lessonId,
      feedId: lessonId,
      lessonTitle: 'Stacks',
      chapterTitle: 'Linear',
      subjectTitle: 'DSA',
      hasExamPack: false,
      concepts: [],
      cards: [],
      feedQuestions: [],
    };
    const read = api(json(material));
    expect(await read.client.readLessonForExam(lessonId)).toEqual(material);
    expect(String(read.fetchMock.mock.calls[0]?.[0])).toBe(
      `https://app.test/api/generation/lessons/${lessonId}/exam`,
    );

    const saved = { packId: lessonId, created: true, questions: 10, openQuestions: 1 };
    const save = api(json(saved, 201));
    const body = {
      lessonId,
      feedId: lessonId,
      promptVersion: '2026-11-24.1',
      pack: { questions: [], openQuestions: [] },
    };
    expect(await save.client.saveExamPack(body)).toEqual(saved);
    expect(save.fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });

  it('legge e completa le segnalazioni sugli indirizzi giusti', async () => {
    const list = api(json({ corrections: [] }));
    expect(await list.client.listPendingReports()).toEqual({ corrections: [] });
    expect(String(list.fetchMock.mock.calls[0]?.[0])).toBe(
      'https://app.test/api/generation/corrections',
    );
    const id = '60000000-0000-4000-8000-000000000001';
    const save = api(json({ saved: true }, 201));
    const completion = { outcome: 'disputed' as const, note: 'Il riassunto dice FIFO.' };
    await save.client.completeReport(id, completion);
    const [url, init] = save.fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`https://app.test/api/generation/corrections/${id}/completion`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ completion }));
  });

  it('legge materie e feed per l’assistente di studio', async () => {
    const subjects = { subjects: [] };
    const first = api(json(subjects));
    expect(await first.client.listStudySubjects()).toEqual(subjects);
    expect(String(first.fetchMock.mock.calls[0]?.[0])).toBe(
      'https://app.test/api/generation/study/subjects',
    );
    const feed = { subjectId: lessonId, title: 'DSA', version: 'f'.repeat(64), chapters: [] };
    const second = api(json(feed));
    expect(await second.client.readStudySubject(lessonId)).toEqual(feed);
    expect(String(second.fetchMock.mock.calls[0]?.[0])).toBe(
      `https://app.test/api/generation/study/subjects/${lessonId}`,
    );
  });

  it('legge la copia cifrata dei progressi, null se non c’è', async () => {
    const stored = {
      kdf: 'pbkdf2-sha256-600000',
      salt: `${'A'.repeat(22)}==`,
      iv: 'B'.repeat(16),
      ciphertext: 'C'.repeat(40),
      revision: 2,
    };
    expect(await api(json(stored)).client.readProgress()).toEqual(stored);
    const missing = api(json({ error: { code: 'NOT_FOUND', message: 'Nessuna copia' } }, 404));
    expect(await missing.client.readProgress()).toBeNull();
    const failing = api(json({ error: { code: 'INTERNAL', message: 'Errore' } }, 500));
    await expect(failing.client.readProgress()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('invia la correzione chiesta a Claude e restituisce quella salvata', async () => {
    const correction = {
      id: '60000000-0000-4000-8000-000000000001',
      subjectId: '40000000-0000-4000-8000-000000000001',
      correction: { kind: 'term', from: 'Big 0', to: 'Big O', reason: 'content' },
      claudeStatus: 'not_needed',
      completion: null,
      createdAt: '2026-11-28T10:00:00.000Z',
    };
    const { client, fetchMock } = api(json({ correction }, 201));
    const body = {
      id: correction.id,
      subjectId: correction.subjectId,
      correction: { kind: 'term' as const, from: 'Big 0', to: 'Big O', reason: 'content' as const },
    };
    expect(await client.reportError(body)).toEqual(correction);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://app.test/api/generation/corrections');
    expect(JSON.parse(init?.body as string)).toEqual(body);
  });
});
