import { describe, expect, it } from 'vitest';
import { answerQuestionRequestSchema, askQuestionRequestSchema } from './questions.js';

const valid = {
  id: '00000000-0000-4000-8000-000000000001',
  subjectId: '00000000-0000-4000-8000-000000000002',
  lessonId: '00000000-0000-4000-8000-000000000003',
  itemType: 'card',
  itemId: 'avl-rotation',
  question: '  Perché?  ',
  language: 'it',
};

describe('contratti delle domande', () => {
  it('accetta una domanda valida e toglie gli spazi', () => {
    expect(askQuestionRequestSchema.parse(valid).question).toBe('Perché?');
  });

  it('rifiuta id della scheda non validi, campi in più e risposte vuote', () => {
    expect(askQuestionRequestSchema.safeParse({ ...valid, itemId: 'A B' }).success).toBe(false);
    expect(askQuestionRequestSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(answerQuestionRequestSchema.safeParse({ answer: '   ' }).success).toBe(false);
  });
});
