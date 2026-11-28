import type { StoredQuestion } from '@epicfeed/assistant';
import { QuestionValidationError, questionsResponseSchema } from '@epicfeed/assistant';
import { DomainError } from '@epicfeed/shared';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionsHandlerDeps } from './questions-handler';
import { handleAskQuestion, handleDeleteQuestion, handleListQuestions } from './questions-handler';

vi.mock('server-only', () => ({}));

const user = '0a0a0a0a-0000-4000-8000-00000000000a';
const id = '70000000-0000-4000-8000-000000000001';
const origin = 'http://localhost';

const body = {
  id,
  subjectId: '40000000-0000-4000-8000-000000000001',
  lessonId: '10000000-0000-4000-8000-000000000001',
  itemType: 'card',
  itemId: 'stack-rule',
  question: 'Perché LIFO?',
  language: 'it',
} as const;

const stored: StoredQuestion = {
  ...body,
  status: 'pending',
  answer: null,
  createdAt: '2026-11-28T10:00:00.000Z',
  answeredAt: null,
};

function deps(overrides: Partial<QuestionsHandlerDeps> = {}): QuestionsHandlerDeps {
  return {
    currentUserId: () => Promise.resolve(user),
    listQuestions: () => Promise.resolve([stored]),
    askQuestion: () => Promise.resolve({ question: stored, created: true }),
    deleteQuestion: () => Promise.resolve(),
    logError: vi.fn(),
    ...overrides,
  };
}

const post = (payload: unknown, headers: Record<string, string> = { origin }) =>
  new Request(`${origin}/api/questions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

describe('handleListQuestions', () => {
  it('restituisce le domande nella forma del contratto, mai in cache', async () => {
    const response = await handleListQuestions(deps());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(questionsResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it('senza sessione 401, errori inattesi 500', async () => {
    expect(
      (await handleListQuestions(deps({ currentUserId: () => Promise.resolve(null) }))).status,
    ).toBe(401);
    expect(
      (await handleListQuestions(deps({ listQuestions: () => Promise.reject(new Error('db')) })))
        .status,
    ).toBe(500);
  });
});

describe('handleAskQuestion', () => {
  it('201 se nuova, 200 se reinviata, id in minuscolo', async () => {
    const askQuestion = vi.fn<QuestionsHandlerDeps['askQuestion']>(() =>
      Promise.resolve({ question: stored, created: true }),
    );
    const upper = { ...body, id: id.toUpperCase() };
    expect((await handleAskQuestion(post(upper), deps({ askQuestion }))).status).toBe(201);
    expect(askQuestion.mock.calls[0]?.[1].id).toBe(id);
    const again = deps({
      askQuestion: () => Promise.resolve({ question: stored, created: false }),
    });
    expect((await handleAskQuestion(post(body), again)).status).toBe(200);
  });

  it('rifiuta altre origini, forma sbagliata, corpo non JSON o troppo grande', async () => {
    expect(
      (await handleAskQuestion(post(body, { origin: 'https://evil.test' }), deps())).status,
    ).toBe(403);
    expect((await handleAskQuestion(post({ ...body, itemId: 'A B' }), deps())).status).toBe(400);
    const notJson = new Request(`${origin}/api/questions`, {
      method: 'POST',
      headers: { origin },
      body: '{',
    });
    expect((await handleAskQuestion(notJson, deps())).status).toBe(400);
    const huge = post(body, { origin, 'content-length': String(1024 * 1024) });
    expect((await handleAskQuestion(huge, deps())).status).toBe(413);
    expect(
      (await handleAskQuestion(post(body), deps({ currentUserId: () => Promise.resolve(null) })))
        .status,
    ).toBe(401);
  });

  it('traduce gli errori del dominio', async () => {
    const failing = (error: Error) =>
      handleAskQuestion(post(body), deps({ askQuestion: () => Promise.reject(error) }));
    expect((await failing(new DomainError('NOT_FOUND', 'x'))).status).toBe(404);
    expect((await failing(new DomainError('LIMIT_REACHED', 'x'))).status).toBe(409);
    expect((await failing(new DomainError('ALREADY_DONE', 'x'))).status).toBe(409);
    expect((await failing(new QuestionValidationError(['vuota'], 'La domanda'))).status).toBe(400);
    expect((await failing(new Error('db'))).status).toBe(500);
  });
});

describe('handleDeleteQuestion', () => {
  const del = (headers: Record<string, string> = { origin }) =>
    new Request(`${origin}/api/questions/${id}`, { method: 'DELETE', headers });

  it('204 se cancellata, 404 se non c’è o l’id non è valido, 403 da altre origini', async () => {
    expect((await handleDeleteQuestion(del(), id, deps())).status).toBe(204);
    expect((await handleDeleteQuestion(del(), 'x', deps())).status).toBe(404);
    const missing = deps({
      deleteQuestion: () => Promise.reject(new DomainError('NOT_FOUND', 'x')),
    });
    expect((await handleDeleteQuestion(del(), id, missing)).status).toBe(404);
    const broken = deps({ deleteQuestion: () => Promise.reject(new Error('db')) });
    expect((await handleDeleteQuestion(del(), id, broken)).status).toBe(500);
    expect((await handleDeleteQuestion(del({}), id, deps())).status).toBe(403);
    expect(
      (await handleDeleteQuestion(del(), id, deps({ currentUserId: () => Promise.resolve(null) })))
        .status,
    ).toBe(401);
  });
});
