import { describe, expect, it } from 'vitest';
import { pickQuiz } from './quiz.js';
import {
  answer,
  currentQuestion,
  isCorrect,
  isFinished,
  next,
  startSession,
  summarize,
  summaryMessage,
} from './quiz-session.js';
import { dsaFeed } from './testing.js';

const quiz = pickQuiz(dsaFeed(), [], { topic: 'avl', count: 2 }, new Date('2026-11-28'));

describe('andamento del quiz nella scheda', () => {
  it('una domanda alla volta, con la spiegazione prima di andare avanti', () => {
    let session = startSession(quiz);
    const first = currentQuestion(session);
    if (!first) throw new Error('manca la domanda');
    expect(next(session)).toBe(session);

    const wrongChoice = first.kind === 'true_false' ? { value: !first.answer } : { index: 2 };
    session = answer(session, wrongChoice, 'it');
    expect(session.revealed).toEqual(wrongChoice);
    // Una seconda risposta alla stessa domanda non conta.
    expect(answer(session, wrongChoice, 'it')).toBe(session);
    session = next(session);

    const second = currentQuestion(session);
    if (!second) throw new Error('manca la domanda');
    const rightChoice =
      second.kind === 'true_false' ? { value: second.answer } : { index: second.correctIndex };
    expect(isCorrect(second, rightChoice)).toBe(true);
    session = next(answer(session, rightChoice, 'en'));

    expect(isFinished(session)).toBe(true);
    expect(currentQuestion(session)).toBeNull();
    expect(answer(session, rightChoice, 'it')).toBe(session);
    expect(session.answers.map((a) => [a.correct, a.language])).toEqual([
      [false, 'it'],
      [true, 'en'],
    ]);
    expect(summarize(session, 'it')).toEqual({ right: 1, total: 2, missed: ['Rotazioni AVL'] });
    expect(summaryMessage(session, 'it')).toContain('Ho sbagliato: Rotazioni AVL');
  });

  it('una scelta del tipo sbagliato non è mai giusta', () => {
    const [first, second] = quiz.questions;
    if (!first || !second) throw new Error('mancano le domande');
    const tf = first.kind === 'true_false' ? first : second;
    const mc = first.kind === 'multiple_choice' ? first : second;
    expect(isCorrect(tf, { index: 0 })).toBe(false);
    expect(isCorrect(mc, { value: true })).toBe(false);
  });

  it('senza errori il messaggio non chiede spiegazioni', () => {
    let session = startSession(quiz);
    for (const question of quiz.questions) {
      const choice =
        question.kind === 'true_false'
          ? { value: question.answer }
          : { index: question.correctIndex };
      session = next(answer(session, choice, 'it'));
    }
    expect(summaryMessage(session, 'it')).not.toContain('sbagliato');
  });
});
