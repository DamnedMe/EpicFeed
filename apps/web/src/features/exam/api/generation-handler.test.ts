import { describe, expect, it, vi } from 'vitest';
import type { LessonId } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import { FeedValidationError } from '@epicfeed/feed';
import {
  accessDeps,
  bi,
  errorOf,
  lessonId,
  partId,
  record,
  request,
  user,
} from '@/server/generation-test-kit';
import {
  handleListExamLessons,
  handleListExamSubjects,
  handleListSubmissionsToCorrect,
  handleReadLessonForExam,
  handleSaveCorrection,
  handleSaveExamBank,
  handleSaveExamPack,
  type ExamGenerationDeps,
} from './generation-handler';

vi.mock('server-only', () => ({}));

const feedId = '50000000-0000-4000-8000-000000000001';
const examMaterial = {
  lessonId: lessonId as LessonId,
  lessonTitle: 'Binary trees',
  chapterTitle: 'Trees',
  subjectTitle: 'DSA',
  feedId,
  hasExamPack: false,
  concepts: [{ key: 'avl-tree', name: 'AVL tree', description: 'A balanced BST.' }],
  cards: [
    {
      title: 'AVL tree',
      keyPoint: 'A balanced BST.',
      body: 'It rebalances.',
      code: { language: 'python', source: 'x = 1' },
      conceptKeys: ['avl-tree'],
    },
  ],
  feedQuestions: ['Is an AVL a BST?'],
};
const examPack = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `q-${i}`,
    question: `Question ${i}?`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanation: 'Because.',
    conceptKey: 'avl-tree',
    difficulty: 2,
  })),
  openQuestions: [],
};
const examBody = { lessonId, feedId, promptVersion: '2026-11-24.1', pack: examPack };

function deps(overrides: Partial<ExamGenerationDeps> = {}): ExamGenerationDeps {
  return {
    ...accessDeps(),
    listExamLessons: () =>
      Promise.resolve({
        lessons: [
          {
            lessonId: lessonId as LessonId,
            lessonTitle: 'Binary trees',
            chapterTitle: 'Trees',
            subjectTitle: 'DSA',
          },
        ],
        totals: { lessons: 2, ready: 1, toGenerate: 1 },
      }),
    readLessonForExam: () => Promise.resolve(examMaterial),
    saveExamPack: () =>
      Promise.resolve({ packId: feedId, created: true, questions: 10, openQuestions: 1 }),
    listExamSubjects: () =>
      Promise.resolve([{ subjectId: lessonId, subjectTitle: 'DSA', concepts: [], hasBank: false }]),
    saveExamBank: () =>
      Promise.resolve({ bankId: feedId, created: true, officials: 1, variants: 2 }),
    listSubmissionsToCorrect: () => Promise.resolve([]),
    saveCorrection: () => Promise.resolve(),
    ...overrides,
  };
}

describe("pacchetti d'esame", () => {
  const examUrl = `/api/generation/lessons/${lessonId}/exam`;
  const postExam = (payload: unknown) =>
    request(examUrl, { method: 'POST', body: JSON.stringify(payload) });

  it('elenca le lezioni senza pacchetto', async () => {
    const response = await handleListExamLessons(request('/api/generation/exam'), deps());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ totals: { toGenerate: 1 } });
  });

  it('legge il feed della lezione e registra la lettura', async () => {
    const d = deps();
    const response = await handleReadLessonForExam(request(examUrl), lessonId, d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(examMaterial);
    expect(record).toHaveBeenCalledWith(user, 'read', lessonId);
  });

  it('risponde 404 per una lezione senza feed e 400 per un id non valido', async () => {
    const missing = await handleReadLessonForExam(
      request(examUrl),
      lessonId,
      deps({ readLessonForExam: () => Promise.reject(new DomainError('NOT_FOUND', 'x')) }),
    );
    expect(missing.status).toBe(404);
    expect((await handleReadLessonForExam(request(examUrl), 'nope', deps())).status).toBe(400);
  });

  it('salva il pacchetto e risponde 201', async () => {
    const saveExamPack = vi.fn(() =>
      Promise.resolve({ packId: feedId, created: true, questions: 10, openQuestions: 1 }),
    );
    const response = await handleSaveExamPack(postExam(examBody), lessonId, deps({ saveExamPack }));
    expect(response.status).toBe(201);
    expect(saveExamPack).toHaveBeenCalledWith(user, expect.objectContaining({ feedId }));
    expect(record).toHaveBeenCalledWith(user, 'save', lessonId);
  });

  it('rifiuta forma, lezione diversa, problemi del pacchetto e feed cambiato', async () => {
    const shape = await handleSaveExamPack(postExam({ ...examBody, pack: {} }), lessonId, deps());
    expect(shape.status).toBe(422);
    const other = await handleSaveExamPack(
      postExam({ ...examBody, lessonId: partId }),
      lessonId,
      deps(),
    );
    expect(other.status).toBe(400);
    const invalid = await handleSaveExamPack(
      postExam(examBody),
      lessonId,
      deps({
        saveExamPack: () =>
          Promise.reject(
            new FeedValidationError([{ path: 'openQuestions', message: 'x' }], 'Il pacchetto'),
          ),
      }),
    );
    expect((await errorOf(invalid)).issues).toEqual([{ path: 'openQuestions', message: 'x' }]);
    const changed = await handleSaveExamPack(
      postExam(examBody),
      lessonId,
      deps({ saveExamPack: () => Promise.reject(new DomainError('SOURCES_CHANGED', 'nuovo')) }),
    );
    expect(changed.status).toBe(409);
  });
});

describe("banche d'esame", () => {
  const url = `/api/generation/exam/subjects/${lessonId}/bank`;
  const [open] = [
    {
      id: 'lifo',
      kind: 'explain',
      prompt: 'Explain LIFO.',
      hints: [bi('Piatti.', 'Plates.')],
      modelAnswer: 'Last in, first out.',
      rubric: [
        { criterion: 'a', points: 1 },
        { criterion: 'b', points: 1 },
        { criterion: 'c', points: 1 },
      ],
      conceptKeys: ['avl-tree'],
      followUp: 'Why?',
      title: 'LIFO',
      origin: 'official',
      page: 1,
    },
  ];
  const body = {
    subjectId: lessonId,
    promptVersion: '2026-11-24.1',
    bank: { exercises: [open] },
  };
  const postBank = (payload: unknown) =>
    request(url, { method: 'POST', body: JSON.stringify(payload) });

  it('elenca le materie', async () => {
    const response = await handleListExamSubjects(request('/api/generation/exam/subjects'), deps());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subjects: [{ subjectTitle: 'DSA' }] });
  });

  it('salva la banca e rifiuta forma, materia diversa e materia sconosciuta', async () => {
    expect((await handleSaveExamBank(postBank(body), lessonId, deps())).status).toBe(201);
    expect(record).toHaveBeenCalledWith(user, 'save', null);
    expect(
      (await handleSaveExamBank(postBank({ ...body, bank: {} }), lessonId, deps())).status,
    ).toBe(422);
    expect(
      (await handleSaveExamBank(postBank({ ...body, subjectId: partId }), lessonId, deps())).status,
    ).toBe(400);
    expect((await handleSaveExamBank(postBank(body), 'x', deps())).status).toBe(400);
    const missing = await handleSaveExamBank(
      postBank(body),
      lessonId,
      deps({ saveExamBank: () => Promise.reject(new DomainError('NOT_FOUND', 'x')) }),
    );
    expect(missing.status).toBe(404);
  });
});

describe('correzione di Claude', () => {
  const submissionId = '50000000-0000-4000-8000-000000000001';
  const url = `/api/generation/exam/submissions/${submissionId}/correction`;
  const correction = {
    summary: 'Good.',
    items: [
      {
        key: 'bank:dfs',
        scores: [2, 1],
        comment: 'Use a set.',
        suggestions: [
          {
            title: 'Use a set',
            explanation: 'O(1) lookups.',
            fromLine: 2,
            toLine: 2,
            replacement: '    seen = set()',
          },
        ],
      },
    ],
  };
  const postCorrection = (payload: unknown, id = submissionId) =>
    handleSaveCorrection(
      request(url, { method: 'POST', body: JSON.stringify(payload) }),
      id,
      deps(),
    );

  it('elenca le risposte da correggere', async () => {
    const response = await handleListSubmissionsToCorrect(
      request('/api/generation/exam/submissions'),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submissions: [] });
    expect(record).toHaveBeenCalledWith(user, 'read', null);
  });

  it('salva la correzione e rifiuta forma e id non validi', async () => {
    expect((await postCorrection({ correction })).status).toBe(201);
    expect((await postCorrection({ correction: { items: [] } })).status).toBe(422);
    expect((await postCorrection({ correction }, 'x')).status).toBe(404);
  });

  it('409 se è già corretta, 422 con i problemi trovati dal dominio', async () => {
    const save = (error: Error) =>
      handleSaveCorrection(
        request(url, { method: 'POST', body: JSON.stringify({ correction }) }),
        submissionId,
        deps({ saveCorrection: () => Promise.reject(error) }),
      );
    expect((await save(new DomainError('ALREADY_DONE', 'x'))).status).toBe(409);
    const invalid = await save(
      new FeedValidationError([{ path: 'items[0].scores', message: 'x' }], 'La correzione'),
    );
    expect(invalid.status).toBe(422);
    expect((await errorOf(invalid)).issues?.[0]?.path).toBe('items[0].scores');
  });
});
