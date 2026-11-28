import type { AnswerRecord } from '@epicfeed/review';
import { describe, expect, it } from 'vitest';
import { MAX_QUIZ_QUESTIONS, pickQuiz, quizAnswerRecords } from './quiz.js';
import { AVL_LESSON, SUBJECT_ID, dsaFeed } from './testing.js';

const now = new Date('2026-11-28T10:00:00.000Z');
const avl = `${SUBJECT_ID}:avl-rotation`;
const wrong: AnswerRecord = {
  conceptId: avl,
  questionId: `${AVL_LESSON}:quiz:avl-case`,
  source: 'feed',
  grade: 'again',
  language: 'it',
  at: '2026-11-27T10:00:00.000Z',
};

describe('scelta delle domande del quiz al volo', () => {
  it('parte dai concetti deboli e mette in fondo l’ultima domanda fatta', () => {
    const quiz = pickQuiz(dsaFeed(), [wrong], { count: 5 }, now);
    expect(quiz.focus).toBe('weak');
    expect(quiz.subjectTitle).toBe(dsaFeed().title);
    expect(quiz.questions.map((q) => q.questionId)).toEqual([
      `${AVL_LESSON}:quiz:avl-balanced`,
      `${AVL_LESSON}:quiz:avl-case`,
    ]);
    const [first, second] = quiz.questions;
    expect(first).toMatchObject({ kind: 'true_false', answer: true, conceptId: avl });
    expect(second).toMatchObject({ kind: 'multiple_choice', correctIndex: 0 });
  });

  it('senza storico mescola i concetti e rispetta il numero di domande', () => {
    const quiz = pickQuiz(dsaFeed(), [], { count: 1 }, now);
    expect(quiz.focus).toBe('mixed');
    expect(quiz.questions).toHaveLength(1);
  });

  it('filtra per argomento sul nome del concetto o sul titolo della lezione', () => {
    expect(pickQuiz(dsaFeed(), [], { topic: 'rotazioni', count: 3 }, now).focus).toBe('requested');
    expect(pickQuiz(dsaFeed(), [], { topic: 'AVL trees', count: 3 }, now).questions).toHaveLength(
      2,
    );
    expect(pickQuiz(dsaFeed(), [], { topic: 'grafi', count: 3 }, now).questions).toEqual([]);
  });

  it('non supera il massimo di domande', () => {
    const quiz = pickQuiz(dsaFeed(), [], { count: MAX_QUIZ_QUESTIONS * 3 }, now);
    expect(quiz.questions.length).toBeLessThanOrEqual(MAX_QUIZ_QUESTIONS);
  });
});

describe('risposte del quiz nello storico', () => {
  it('giusta vale «bene», sbagliata «di nuovo», con momenti distinti', () => {
    const records = quizAnswerRecords(
      [
        { conceptId: avl, questionId: 'q1', correct: true, language: 'en' },
        { conceptId: avl, questionId: null, correct: false, language: 'it' },
      ],
      now,
    );
    expect(records.map((r) => [r.source, r.grade, r.language])).toEqual([
      ['quiz', 'good', 'en'],
      ['quiz', 'again', 'it'],
    ]);
    expect(records[1]?.at).toBe(now.toISOString());
    expect(records[0]?.at).not.toBe(records[1]?.at);
  });
});
