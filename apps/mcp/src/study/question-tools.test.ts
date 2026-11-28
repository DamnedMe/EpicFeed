import type { StoredQuestion } from '@epicfeed/assistant';
import { describe, expect, it } from 'vitest';
import { formatQuestion } from './question-tools.js';
import { AVL_LESSON, SUBJECT_ID, dsaFeed } from './testing.js';

const base: StoredQuestion = {
  id: '70000000-0000-4000-8000-000000000001',
  subjectId: SUBJECT_ID,
  lessonId: AVL_LESSON,
  itemType: 'card',
  itemId: 'avl-rotation',
  question: 'Perché due rotazioni?',
  language: 'en',
  status: 'pending',
  answer: null,
  createdAt: '2026-11-28T10:00:00.000Z',
  answeredAt: null,
};

describe('domanda in coda per Claude', () => {
  it('scheda con il minuto del video, nella lingua di studio', () => {
    const text = formatQuestion(base, dsaFeed());
    expect(text).toContain('studia in inglese');
    expect(text).toContain('Video dal minuto 2:05.');
  });

  it('domanda del feed con la soluzione', () => {
    const multiple = formatQuestion(
      { ...base, itemType: 'quiz', itemId: 'avl-case', language: 'it' },
      dsaFeed(),
    );
    expect(multiple).toContain('A) Sinistra');
    expect(multiple).toContain('Giusta: A');
    const trueFalse = formatQuestion(
      { ...base, itemType: 'quiz', itemId: 'avl-balanced' },
      dsaFeed(),
    );
    expect(trueFalse).toContain('Vero o falso');
  });

  it('elemento non più nel feed o materia non letta', () => {
    expect(formatQuestion({ ...base, itemId: 'sparita' }, dsaFeed())).toContain('rigenerata');
    expect(formatQuestion({ ...base, itemType: 'quiz', itemId: 'sparita' }, dsaFeed())).toContain(
      'non più nel feed',
    );
    expect(formatQuestion(base, null)).toContain(SUBJECT_ID);
  });
});
