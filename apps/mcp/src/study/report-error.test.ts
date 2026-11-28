import { describe, expect, it } from 'vitest';
import { prepareReport } from './report-error.js';
import { AVL_LESSON, HEAP_LESSON, dsaFeed } from './testing.js';

const fix = (language: 'it' | 'en') => ({
  field: 'keyPoint' as const,
  language,
  original: 'O(n)',
  corrected: 'O(log n)',
});

describe('segnala errore da Claude', () => {
  it('prepara la frase corretta nelle due lingue con l’anteprima', () => {
    const result = prepareReport(dsaFeed(), {
      kind: 'text',
      lessonId: HEAP_LESSON.toUpperCase(),
      itemType: 'card',
      itemId: 'heap-sift',
      edits: [fix('it'), fix('en')],
      reason: 'content',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.draft).toMatchObject({ kind: 'text', lessonId: HEAP_LESSON });
    expect(result.report.after).toMatchObject({
      keyPoint: { it: 'Il sift-down costa O(log n).', en: 'Sift-down costs O(log n).' },
    });
    // L'anteprima e la copia per Claude non portano minuti né parti.
    expect(result.report.before).not.toHaveProperty('video');
  });

  it('rifiuta una frase che non c’è, una già giusta, un elemento o una lezione inesistenti', () => {
    const base = {
      kind: 'text' as const,
      lessonId: HEAP_LESSON,
      itemType: 'card' as const,
      reason: 'content' as const,
    };
    const missing = prepareReport(dsaFeed(), {
      ...base,
      itemId: 'heap-sift',
      edits: [{ ...fix('it'), original: 'O(n²)' }],
    });
    expect(missing.ok).toBe(false);
    const already = prepareReport(dsaFeed(), {
      ...base,
      itemId: 'heap-sift',
      edits: [{ ...fix('it'), original: 'sift-down', corrected: 'sift-down' }],
    });
    expect(already.ok).toBe(false);
    expect(prepareReport(dsaFeed(), { ...base, itemId: 'nessuna', edits: [fix('it')] }).ok).toBe(
      false,
    );
    expect(
      prepareReport(dsaFeed(), {
        ...base,
        lessonId: '10000000-0000-4000-8000-000000000003',
        itemId: 'heap-sift',
        edits: [fix('it')],
      }).ok,
    ).toBe(false);
  });

  it('corregge la risposta giusta di una domanda a scelta multipla o vero/falso', () => {
    const multiple = prepareReport(dsaFeed(), {
      kind: 'answer',
      lessonId: AVL_LESSON,
      itemId: 'avl-case',
      correct: { index: 2 },
      reason: 'content',
    });
    expect(multiple.ok && multiple.report.draft).toMatchObject({
      kind: 'answer',
      fix: { kind: 'multiple_choice', correctIndex: 2, option: { en: 'Right-left' } },
    });
    const trueFalse = prepareReport(dsaFeed(), {
      kind: 'answer',
      lessonId: AVL_LESSON,
      itemId: 'avl-balanced',
      correct: { answer: false },
      reason: 'content',
    });
    expect(trueFalse.ok && trueFalse.report.draft).toMatchObject({
      fix: { kind: 'true_false', answer: false },
    });
  });

  it('rifiuta una risposta già giusta o della forma sbagliata', () => {
    const ask = (itemId: string, correct: { index: number } | { answer: boolean }) =>
      prepareReport(dsaFeed(), {
        kind: 'answer',
        lessonId: AVL_LESSON,
        itemId,
        correct,
        reason: 'content',
      });
    expect(ask('avl-case', { index: 0 }).ok).toBe(false);
    expect(ask('avl-case', { index: 9 }).ok).toBe(false);
    expect(ask('avl-case', { answer: true }).ok).toBe(false);
    expect(ask('avl-balanced', { answer: true }).ok).toBe(false);
    expect(ask('avl-balanced', { index: 1 }).ok).toBe(false);
    expect(ask('avl-rotation', { index: 1 }).ok).toBe(false);
  });

  it('conta dove compare un termine prima di correggerlo ovunque', () => {
    const term = prepareReport(dsaFeed(), {
      kind: 'term',
      from: 'Big 0',
      to: 'Big O',
      reason: 'content',
    });
    expect(term.ok && term.report.usage).toMatchObject({ items: 1, lessonTitles: ['Heaps'] });
    expect(
      prepareReport(dsaFeed(), { kind: 'term', from: 'Theta', to: 'Θ', reason: 'content' }).ok,
    ).toBe(false);
    expect(
      prepareReport(dsaFeed(), { kind: 'term', from: 'heap', to: 'heap', reason: 'content' }).ok,
    ).toBe(false);
  });
});
