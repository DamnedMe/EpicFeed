import { describe, expect, it } from 'vitest';
import type { CardEntry, QuizEntry } from '../model';
import { editFor, fragmentForBeat, fragmentsOf, termChange } from './fragments';

const bi = <T>(it: T, en: T) => ({ it, en });
const base = {
  key: 'l:card:c',
  chapterIndex: 0,
  chapterTitle: 'Pile',
  lessonId: 'l',
  lessonTitle: 'Pile e code',
  lessonPortalUrl: 'https://learn.epicode.edu.mt/x',
  source: null,
  video: null,
};

function card(extra: Partial<CardEntry['card']>): CardEntry {
  return {
    ...base,
    type: 'card',
    card: {
      id: 'c',
      kind: 'concept',
      title: bi('Pile', 'Stacks'),
      keyPoint: bi('Una pila è FIFO.', 'A stack is FIFO.'),
      body: bi(
        'Si inserisce sempre in cima alla pila. Si toglie sempre dalla cima della pila.',
        'You always push on top of the stack. You always pop from the top of the stack.',
      ),
      terms: [],
      conceptKeys: ['stack'] as never,
      sourcePartId: '20000000-0000-4000-8000-000000000001' as never,
      origin: 'summary',
      video: null,
      ...extra,
    },
  };
}

describe('fragmentsOf', () => {
  it('elenca titolo, frase chiave e frasi della spiegazione', () => {
    expect(fragmentsOf(card({}), 'it').map((f) => [f.field, f.label, f.text])).toEqual([
      ['title', 'titolo', 'Pile'],
      ['keyPoint', 'frase chiave', 'Una pila è FIFO.'],
      ['body', 'spiegazione 1', 'Si inserisce sempre in cima alla pila.'],
      ['body', 'spiegazione 2', 'Si toglie sempre dalla cima della pila.'],
    ]);
  });

  it('aggiunge passi, righe del confronto e codice', () => {
    const steps = fragmentsOf(card({ kind: 'steps', steps: bi(['a', 'b'], ['a', 'b']) }), 'en');
    expect(steps.filter((f) => f.field === 'steps').map((f) => f.index)).toEqual([0, 1]);
    const comparison = fragmentsOf(
      card({
        kind: 'comparison',
        comparison: {
          left: bi('Pila', 'Stack'),
          right: bi('Coda', 'Queue'),
          rows: [
            { aspect: bi('Regola', 'Rule'), left: bi('LIFO', 'LIFO'), right: bi('FIFO', 'FIFO') },
          ],
        },
      }),
      'it',
    );
    expect(comparison.map((f) => f.field)).toContain('rowRight');
    const code = fragmentsOf(
      card({ kind: 'code', code: { language: 'py', source: 'a = 1\n\nb()' } }),
      'it',
    );
    expect(code.filter((f) => f.field === 'code').map((f) => f.text)).toEqual(['a = 1', 'b()']);
  });

  it('per le domande: domanda, opzioni e spiegazione', () => {
    const quiz: QuizEntry = {
      ...base,
      type: 'quiz',
      batch: { position: 1, size: 1 },
      quiz: {
        id: 'q',
        kind: 'multiple_choice',
        question: bi('Cosa?', 'What?'),
        explanation: bi('Perché.', 'Because.'),
        options: bi(['a', 'b'], ['a', 'b']),
        correctIndex: 0,
        conceptKey: 'stack' as never,
        difficulty: 1,
      },
    };
    expect(fragmentsOf(quiz, 'it').map((f) => f.field)).toEqual([
      'question',
      'options',
      'options',
      'explanation',
    ]);
  });
});

describe('fragmentForBeat', () => {
  const fragments = fragmentsOf(card({}), 'it');
  it('parte dalla frase della battuta mostrata', () => {
    expect(fragmentForBeat(fragments, { kind: 'key' })).toBe(1);
    expect(fragmentForBeat(fragments, { kind: 'line', index: 1 })).toBe(3);
    expect(fragmentForBeat(fragments, { kind: 'note' })).toBe(2);
    expect(fragmentForBeat(fragments, { kind: 'step', index: 4 })).toBe(0);
    expect(fragmentForBeat(fragments, null)).toBe(0);
  });
});

describe('editFor e termChange', () => {
  const [, key] = fragmentsOf(card({}), 'it');
  it('crea l’intervento solo se il testo cambia', () => {
    expect(key && editFor(key, '  Una pila è LIFO. ', 'it')).toEqual({
      field: 'keyPoint',
      language: 'it',
      original: 'Una pila è FIFO.',
      corrected: 'Una pila è LIFO.',
    });
    expect(key && editFor(key, 'Una pila è FIFO.', 'it')).toBeNull();
    expect(key && editFor(key, '   ', 'it')).toBeNull();
  });

  it('riconosce un termine cambiato, a parole intere', () => {
    expect(termChange('La Big 0 è costante.', 'La Big O è costante.')).toEqual({
      from: 'Big 0',
      to: 'Big O',
    });
    expect(termChange('Usa use state qui.', 'Usa useState qui.')).toEqual({
      from: 'use state',
      to: 'useState',
    });
    expect(termChange('Una pila è FIFO.', 'Una pila è LIFO.')).toEqual({
      from: 'FIFO',
      to: 'LIFO',
    });
    expect(termChange('Frase uno.', 'Tutt’altra frase, riscritta da capo.')).toBeNull();
    expect(termChange('x', 'x')).toBeNull();
  });
});
