import { describe, expect, it } from 'vitest';
import type {
  ConceptKey,
  ContentHash,
  ExamPackDocument,
  ExamPackDraft,
  LessonFeedDocument,
  LessonId,
  LessonPartId,
  UserId,
} from '../domain/index.js';
import { DomainError, FeedValidationError } from '../domain/index.js';
import type { CurrentLessonFeedWithDocument, ExamPackRepository } from './exam-generation.js';
import {
  ListLessonsForExam,
  ReadLessonForExam,
  SaveExamPack,
  examMaterialFromFeed,
} from './exam-generation.js';

const user = '0a0a0a0a-0000-4000-8000-00000000000a' as UserId;
const lessonA = '10000000-0000-4000-8000-000000000001' as LessonId;
const lessonB = '10000000-0000-4000-8000-000000000002' as LessonId;
const part = '20000000-0000-4000-8000-000000000001' as LessonPartId;
const feedA = '60000000-0000-4000-8000-000000000001';
const bi = (it: string, en: string) => ({ it, en });
const key = (value: string) => value as ConceptKey;
const clock = { now: () => new Date('2026-11-24T10:00:00.000Z') };

const document: LessonFeedDocument = {
  lessonId: lessonA,
  sourcesHash: 'a'.repeat(64) as ContentHash,
  promptVersion: '2026-11-21.2',
  generatedAt: '2026-11-22T20:00:00.000Z',
  cards: [
    {
      id: 'stack',
      kind: 'code',
      title: bi('Pila', 'Stack'),
      keyPoint: bi('LIFO.', 'Last in, first out.'),
      body: bi('Si aggiunge e toglie in cima.', 'Push and pop at the top.'),
      code: { language: 'python', source: 'stack.append(1)' },
      terms: [],
      conceptKeys: [key('stack')],
      sourcePartId: part,
      origin: 'summary',
      video: null,
    },
  ],
  quiz: [
    {
      id: 'q1',
      kind: 'true_false',
      question: bi('Una pila è LIFO?', 'Is a stack LIFO?'),
      explanation: bi('Sì.', 'Yes.'),
      conceptKey: key('stack'),
      difficulty: 1,
      answer: true,
    },
  ],
  concepts: [{ key: key('stack'), name: bi('Pila', 'Stack'), description: bi('LIFO', 'LIFO') }],
};

const current: CurrentLessonFeedWithDocument = {
  lessonId: lessonA,
  lessonTitle: 'Stacks',
  chapterTitle: 'Linear structures',
  subjectTitle: 'DSA',
  feedId: feedA,
  hasExamPack: false,
  document,
};

const pack: ExamPackDraft = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `q-${i}`,
    question: `Which operation ${i} removes the top?`,
    options: ['push', 'pop', 'peek', 'size'],
    correctIndex: 1,
    explanation: 'pop removes the top.',
    conceptKey: key('stack'),
    difficulty: 2 as const,
  })),
  openQuestions: [
    {
      id: 'explain-lifo',
      kind: 'explain',
      prompt: 'Explain LIFO with an example.',
      hints: [bi('Pensa ai piatti.', 'Think of plates.')],
      modelAnswer: 'The last element pushed is the first popped.',
      rubric: [
        { criterion: 'Defines LIFO', points: 2 },
        { criterion: 'Gives an example', points: 2 },
        { criterion: 'Names push and pop', points: 1 },
      ],
      conceptKeys: [key('stack')],
      followUp: 'Where is a stack used by the interpreter?',
    },
  ],
};

/** Repository in memoria. */
class MemoryRepository implements ExamPackRepository {
  saved: ExamPackDocument[] = [];
  constructor(private readonly feeds: CurrentLessonFeedWithDocument[] = [current]) {}
  listCurrentFeeds() {
    return Promise.resolve(
      this.feeds.map((feed) => ({
        lessonId: feed.lessonId,
        lessonTitle: feed.lessonTitle,
        chapterTitle: feed.chapterTitle,
        subjectTitle: feed.subjectTitle,
        feedId: feed.feedId,
        hasExamPack: feed.hasExamPack,
      })),
    );
  }
  loadCurrentFeed(_user: UserId, lessonId: LessonId) {
    return Promise.resolve(this.feeds.find((feed) => feed.lessonId === lessonId) ?? null);
  }
  saveExamPack(input: { document: ExamPackDocument }) {
    const created = !this.saved.some((doc) => doc.feedId === input.document.feedId);
    if (created) this.saved.push(input.document);
    return Promise.resolve({ packId: '70000000-0000-4000-8000-000000000001', created });
  }
}

describe('ListLessonsForExam', () => {
  it('elenca solo i feed senza pacchetto, con i totali', async () => {
    const repo = new MemoryRepository([
      current,
      { ...current, lessonId: lessonB, feedId: 'other', hasExamPack: true },
    ]);
    const result = await new ListLessonsForExam(repo).execute(user, 10);
    expect(result.lessons.map((lesson) => lesson.lessonId)).toEqual([lessonA]);
    expect(result.totals).toEqual({ lessons: 2, ready: 1, toGenerate: 1 });
    expect((await new ListLessonsForExam(repo).execute(user, 0)).lessons).toEqual([]);
  });
});

describe('ReadLessonForExam', () => {
  it('restituisce il feed in inglese', async () => {
    const material = await new ReadLessonForExam(new MemoryRepository()).execute(user, lessonA);
    expect(material).toEqual(examMaterialFromFeed(current));
    expect(material.cards[0]).toEqual({
      title: 'Stack',
      keyPoint: 'Last in, first out.',
      body: 'Push and pop at the top.',
      code: { language: 'python', source: 'stack.append(1)' },
      conceptKeys: ['stack'],
    });
    expect(material.feedQuestions).toEqual(['Is a stack LIFO?']);
    expect(material.concepts).toEqual([{ key: 'stack', name: 'Stack', description: 'LIFO' }]);
  });

  it('rifiuta una lezione senza feed', async () => {
    await expect(
      new ReadLessonForExam(new MemoryRepository()).execute(user, lessonB),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('SaveExamPack', () => {
  const input = { lessonId: lessonA, feedId: feedA, promptVersion: '2026-11-24.1', pack };

  it('salva il pacchetto legato al feed corrente', async () => {
    const repo = new MemoryRepository();
    const result = await new SaveExamPack({ repository: repo, clock }).execute(user, input);
    expect(result).toEqual({
      packId: '70000000-0000-4000-8000-000000000001',
      created: true,
      questions: 10,
      openQuestions: 1,
    });
    expect(repo.saved[0]).toMatchObject({
      lessonId: lessonA,
      feedId: feedA,
      generatedAt: '2026-11-24T10:00:00.000Z',
    });
  });

  it('rifiuta un pacchetto scritto su un feed vecchio', async () => {
    const save = new SaveExamPack({ repository: new MemoryRepository(), clock });
    await expect(save.execute(user, { ...input, feedId: 'old' })).rejects.toMatchObject({
      code: 'SOURCES_CHANGED',
    });
    await expect(save.execute(user, { ...input, lessonId: lessonB })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('restituisce tutti i problemi del pacchetto', async () => {
    const save = new SaveExamPack({ repository: new MemoryRepository(), clock });
    const bad = {
      ...pack,
      questions: pack.questions.map((q, i) =>
        i === 0 ? { ...q, question: 'Is a stack LIFO?', conceptKey: key('queue') } : q,
      ),
    };
    const error = await save.execute(user, { ...input, pack: bad }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FeedValidationError);
    expect((error as FeedValidationError).issues.map((issue) => issue.path)).toEqual([
      'questions[0].conceptKey',
      'questions[0].question',
    ]);
    expect((error as FeedValidationError).message).toContain("Il pacchetto d'esame");
  });
});
