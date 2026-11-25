import { describe, expect, it } from 'vitest';
import type { StoredCorrection } from '@epicfeed/feed';
import { reportStatus, reportSummary } from './describe';

const base: StoredCorrection = {
  id: '60000000-0000-4000-8000-000000000001',
  subjectId: '40000000-0000-4000-8000-000000000001',
  correction: {
    kind: 'text',
    lessonId: '10000000-0000-4000-8000-000000000001',
    itemType: 'card',
    itemId: 'stack-rule',
    edits: [
      { field: 'keyPoint', language: 'it', original: 'regola FIFO', corrected: 'regola LIFO' },
    ],
    reason: 'content',
    snapshot: {},
  },
  claudeStatus: 'pending',
  completion: null,
  createdAt: '2026-11-25T10:00:00.000Z',
};

describe('reportStatus', () => {
  it('distingue applicata, in attesa, da inviare e da ricontrollare', () => {
    expect(reportStatus(base, false, 'applied').label).toBe(
      'Applicata · altra lingua in attesa di Claude',
    );
    expect(reportStatus({ ...base, claudeStatus: 'done' }, false, 'applied')).toMatchObject({
      tone: 'ok',
      label: 'Applicata',
    });
    expect(reportStatus(base, true, 'applied').label).toBe('Da inviare');
    expect(reportStatus(base, false, 'missing').tone).toBe('check');
    const disputed = reportStatus(
      {
        ...base,
        claudeStatus: 'disputed',
        completion: { outcome: 'disputed', note: 'Il riassunto dice FIFO.', evidence: 'FIFO' },
      },
      false,
      'applied',
    );
    expect(disputed.detail).toBe('Il riassunto dice FIFO. Dal riassunto: «FIFO»');
    const regenerate: StoredCorrection = {
      ...base,
      correction: {
        kind: 'regenerate',
        lessonId: '10000000-0000-4000-8000-000000000001',
        itemType: 'card',
        itemId: 'x',
        reason: 'unclear',
        snapshot: {},
      },
    };
    expect(reportStatus(regenerate, false, undefined).label).toBe('In attesa di Claude');
    const term: StoredCorrection = {
      ...base,
      claudeStatus: 'not_needed',
      correction: { kind: 'term', from: 'Big 0', to: 'Big O', reason: 'content' },
    };
    expect(reportStatus(term, false, undefined).label).toBe('Applicata in tutta la materia');
    expect(reportSummary(term)).toBe('Termine «Big 0» → «Big O»');
    expect(reportSummary(regenerate)).toBe('Da riscrivere dai riassunti');
  });

  it('riassume testo e risposte', () => {
    expect(reportSummary(base)).toBe('«regola FIFO» → «regola LIFO»');
    const answer = (fix: Extract<StoredCorrection['correction'], { kind: 'answer' }>['fix']) =>
      reportSummary({
        ...base,
        correction: {
          kind: 'answer',
          lessonId: '10000000-0000-4000-8000-000000000001',
          itemId: 'q',
          fix,
          question: { it: 'La pila è LIFO?', en: 'Is a stack LIFO?' },
          reason: 'content',
          snapshot: {},
        },
      });
    expect(answer({ kind: 'true_false', answer: true })).toBe(
      'Risposta giusta: vero · «La pila è LIFO?»',
    );
    expect(
      answer({ kind: 'multiple_choice', correctIndex: 2, option: { it: 'pop', en: 'pop' } }),
    ).toBe('Risposta giusta: «pop»');
  });
});
