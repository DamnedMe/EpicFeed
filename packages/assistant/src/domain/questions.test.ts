import { describe, expect, it } from 'vitest';
import { QUESTION_LIMITS, checkAnswer, checkQuestion } from './questions.js';

const draft = {
  lessonId: 'l',
  itemType: 'card' as const,
  itemId: 'avl',
  question: 'Perché?',
  language: 'it' as const,
};

describe('regole delle domande in coda', () => {
  it('domanda non vuota e non troppo lunga', () => {
    expect(checkQuestion(draft)).toEqual([]);
    expect(checkQuestion({ ...draft, question: '   ' })).toEqual(['La domanda è vuota.']);
    expect(
      checkQuestion({ ...draft, question: 'a'.repeat(QUESTION_LIMITS.question + 1) }),
    ).toHaveLength(1);
  });

  it('risposta non vuota e non troppo lunga', () => {
    expect(checkAnswer('Ecco.')).toEqual([]);
    expect(checkAnswer(' ')).toEqual(['La risposta è vuota.']);
    expect(checkAnswer('a'.repeat(QUESTION_LIMITS.answer + 1))[0]).toContain('accorciala');
  });
});
