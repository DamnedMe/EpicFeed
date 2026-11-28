import { DomainError } from '@epicfeed/shared';
import { describe, expect, it, vi } from 'vitest';
import { accessDeps, errorOf, record, request, user } from '@/server/generation-test-kit';
import type { QuestionGenerationDeps } from './question-generation-handler';
import { handleAnswerQuestion, handleListPendingQuestions } from './question-generation-handler';

vi.mock('server-only', () => ({}));

const id = '70000000-0000-4000-8000-000000000001';
const url = `/api/generation/questions/${id}/answer`;

function deps(overrides: Partial<QuestionGenerationDeps> = {}): QuestionGenerationDeps {
  return {
    ...accessDeps(),
    listPendingQuestions: () => Promise.resolve([]),
    answerQuestion: () => Promise.resolve(),
    ...overrides,
  };
}

const post = (payload: unknown, rawId = id, d = deps()) =>
  handleAnswerQuestion(request(url, { method: 'POST', body: JSON.stringify(payload) }), rawId, d);

describe('API delle domande per Claude Desktop', () => {
  it('elenca le domande in attesa con il token e conta la lettura', async () => {
    const response = await handleListPendingQuestions(request('/api/generation/questions'), deps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ questions: [] });
    expect(record).toHaveBeenCalledWith(user, 'read', null);
    const anonymous = await handleListPendingQuestions(
      request('/api/generation/questions', {}, 'sfg_wrong'),
      deps(),
    );
    expect(anonymous.status).toBe(401);
    const broken = await handleListPendingQuestions(
      request('/api/generation/questions'),
      deps({ listPendingQuestions: () => Promise.reject(new Error('db')) }),
    );
    expect(broken.status).toBe(500);
  });

  it('salva la risposta, con l’id in minuscolo', async () => {
    const answerQuestion = vi.fn(() => Promise.resolve());
    const response = await post(
      { answer: ' Perché sì. ' },
      id.toUpperCase(),
      deps({ answerQuestion }),
    );
    expect(response.status).toBe(201);
    expect(answerQuestion).toHaveBeenCalledWith(user, id, 'Perché sì.');
  });

  it('rifiuta id non validi, forma sbagliata e domande già con risposta', async () => {
    expect((await post({ answer: 'x' }, 'x')).status).toBe(404);
    const invalid = await post({ answer: '' });
    expect(invalid.status).toBe(422);
    expect(await errorOf(invalid)).toMatchObject({ code: 'INVALID_FEED' });
    const done = await post(
      { answer: 'x' },
      id,
      deps({ answerQuestion: () => Promise.reject(new DomainError('ALREADY_DONE', 'già')) }),
    );
    expect(done.status).toBe(409);
    const anonymous = await handleAnswerQuestion(
      request(url, { method: 'POST', body: '{}' }, 'sfg_wrong'),
      id,
      deps(),
    );
    expect(anonymous.status).toBe(401);
    const notJson = await handleAnswerQuestion(
      request(url, { method: 'POST', body: '{' }),
      id,
      deps(),
    );
    expect(notJson.status).toBe(400);
  });
});
