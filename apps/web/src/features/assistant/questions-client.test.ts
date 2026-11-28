import { describe, expect, it, vi } from 'vitest';
import { deleteQuestion, loadQuestions, queueQuestion } from './questions-client';

const question = {
  id: '70000000-0000-4000-8000-000000000001',
  subjectId: '40000000-0000-4000-8000-000000000001',
  lessonId: '10000000-0000-4000-8000-000000000001',
  itemType: 'card' as const,
  itemId: 'stack-rule',
  question: 'Perché?',
  language: 'it' as const,
};
const stored = {
  ...question,
  status: 'pending',
  answer: null,
  createdAt: '2026-11-28T10:00:00.000Z',
  answeredAt: null,
};
const json = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('domande in coda dal browser', () => {
  it('mette in coda e legge la domanda salvata', async () => {
    const fetchFn = vi.fn(json(201, { question: stored }));
    expect(await queueQuestion(question, fetchFn)).toEqual({ status: 'ok', question: stored });
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/questions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('riporta il messaggio del server, la rete assente e risposte strane', async () => {
    expect(
      await queueQuestion(question, json(409, { error: { code: 'CONFLICT', message: 'Troppe' } })),
    ).toEqual({ status: 'failed', message: 'Troppe' });
    expect((await queueQuestion(question, json(500, 'x'))).status).toBe('failed');
    expect((await queueQuestion(question, json(201, { question: 1 }))).status).toBe('failed');
    expect(
      await queueQuestion(question, () => Promise.reject(new TypeError('Failed to fetch'))),
    ).toMatchObject({ message: /connessione/ });
  });

  it('elenca e cancella', async () => {
    expect(await loadQuestions(json(200, { questions: [stored] }))).toEqual([stored]);
    expect(await loadQuestions(json(401, {}))).toBeNull();
    expect(await loadQuestions(json(200, { questions: 'x' }))).toBeNull();
    expect(await loadQuestions(() => Promise.reject(new Error('rete')))).toBeNull();
    expect(
      await deleteQuestion('a', () => Promise.resolve(new Response(null, { status: 204 }))),
    ).toBe(true);
    expect(await deleteQuestion('a', json(404, {}))).toBe(true);
    expect(await deleteQuestion('a', json(500, {}))).toBe(false);
    expect(await deleteQuestion('a', () => Promise.reject(new Error('rete')))).toBe(false);
  });
});
