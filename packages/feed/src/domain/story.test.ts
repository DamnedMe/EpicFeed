import { describe, expect, it } from 'vitest';
import type { StoryCardInput } from './story.js';
import {
  autoAdvanceMs,
  beatText,
  codeBlocks,
  highlightTerms,
  pairCodeExplanation,
  pickBlank,
  splitSentences,
  storyOf,
} from './story.js';

const bi = (it: string, en: string) => ({ it, en });
const cut = (text: string, range: { start: number; end: number } | null) =>
  range ? text.slice(range.start, range.end) : null;

describe('splitSentences', () => {
  it('divide alle fine frase seguite da maiuscola o cifra', () => {
    expect(
      splitSentences(
        'Le tre operazioni lavorano solo sulla cima dello stack. Sappiamo dove inserire, quindi non serve scorrere nulla! 3 casi restano possibili, tutti costanti.',
      ),
    ).toEqual([
      'Le tre operazioni lavorano solo sulla cima dello stack.',
      'Sappiamo dove inserire, quindi non serve scorrere nulla!',
      '3 casi restano possibili, tutti costanti.',
    ]);
  });

  it('non divide su decimali, punti nel codice, abbreviazioni e minuscole', () => {
    expect(
      splitSentences(
        'Si imposta cursor.next = null e il costo è 3.5 volte più alto, es. Python lo fa da sé. dequeue e peek restano identici in ogni caso.',
      ),
    ).toHaveLength(1);
  });

  it('unisce i pezzi troppo corti alla frase precedente', () => {
    expect(
      splitSentences(
        'Una hash table usa una funzione di hash per gli indici. Sempre. Poi segue tutto il resto della spiegazione.',
      ),
    ).toEqual([
      'Una hash table usa una funzione di hash per gli indici. Sempre.',
      'Poi segue tutto il resto della spiegazione.',
    ]);
    expect(
      splitSentences('Corto. Ma poi arriva una frase molto più lunga di trenta caratteri.'),
    ).toEqual(['Corto. Ma poi arriva una frase molto più lunga di trenta caratteri.']);
  });

  it('restituisce un elenco vuoto per un testo vuoto', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('pickBlank', () => {
  it('copre il termine più lungo che compare come parola intera', () => {
    const text =
      'Una collisione avviene quando due chiavi finiscono sulla stessa cella della hash table.';
    expect(cut(text, pickBlank(text, ['hash', 'hash table', 'collision']))).toBe('hash table');
  });

  it('non trova un termine dentro un’altra parola e ignora le maiuscole', () => {
    const text = 'Push aggiunge in cima, pop toglie dalla cima: tutte operazioni rapide.';
    expect(cut(text, pickBlank(text, ['top', 'push']))).toBe('Push');
  });

  it('ripiega su una complessità o su un numero', () => {
    const complexity = 'La ricerca costa in media O(1) qualunque sia la dimensione.';
    expect(cut(complexity, pickBlank(complexity, ['bucket']))).toBe('O(1)');
    const code = 'Lo si scavalca: cur.next = cur.next.next.';
    expect(cut(code, pickBlank(code, ['deletion']))).toBe('cur.next');
    const number = 'Il valore di MAD è 8115 mod 101.';
    expect(cut(number, pickBlank(number, []))).toBe('8115');
  });

  it('non copre quasi tutta la frase e restituisce null se non trova nulla', () => {
    expect(pickBlank('Stack', ['stack'])).toBeNull();
    expect(pickBlank('Nessun termine qui dentro.', ['heap'])).toBeNull();
  });
});

describe('highlightTerms', () => {
  it('evidenzia i termini preferendo il più lungo e senza sovrapposizioni', () => {
    expect(highlightTerms('La hash table usa una hash function.', ['hash', 'hash table'])).toEqual([
      { text: 'La ', term: false },
      { text: 'hash table', term: true },
      { text: ' usa una ', term: false },
      { text: 'hash', term: true },
      { text: ' function.', term: false },
    ]);
  });

  it('restituisce il testo intero se non ci sono termini', () => {
    expect(highlightTerms('', [])).toEqual([{ text: '', term: false }]);
    expect(highlightTerms('push', ['push'])).toEqual([{ text: 'push', term: true }]);
  });
});

const mergeSort = [
  'def merge_sort(arr):',
  '    mid = len(arr) // 2',
  '    left_half = arr[:mid]',
  '',
  '    merge_sort(left_half)',
  '',
  '',
  '    while i < len(left_half):',
  '        arr[k] = left_half[i]',
];

describe('codeBlocks e pairCodeExplanation', () => {
  it('divide il codice nei blocchi separati da righe vuote', () => {
    expect(codeBlocks(mergeSort)).toEqual([
      { from: 0, to: 2 },
      { from: 4, to: 4 },
      { from: 7, to: 8 },
    ]);
    expect(codeBlocks(['a', ''])).toEqual([{ from: 0, to: 0 }]);
  });

  it('illumina il blocco con più nomi in comune, nessuno se non ce ne sono', () => {
    expect(
      pairCodeExplanation(mergeSort, [
        'mid è il punto di divisione: si calcola con len.',
        'Il ciclo while copia left_half in arr.',
        'Il caso base è banale.',
      ]),
    ).toEqual([
      { text: 'mid è il punto di divisione: si calcola con len.', lines: [{ from: 0, to: 2 }] },
      {
        text: 'Il ciclo while copia left_half in arr.',
        lines: [
          { from: 0, to: 2 },
          { from: 7, to: 8 },
        ],
      },
      { text: 'Il caso base è banale.', lines: null },
    ]);
  });

  it('con un blocco solo illumina le righe che citano i nomi', () => {
    const code = [
      'my_list = []',
      'my_list.append((2, "a"))',
      'my_list.sort(reverse=True)',
      'x = 1',
      'my_list.sort(reverse=True)',
    ];
    expect(
      pairCodeExplanation(code, ['Con reverse=True la priorità più alta finisce in testa.']),
    ).toEqual([
      {
        text: 'Con reverse=True la priorità più alta finisce in testa.',
        lines: [
          { from: 2, to: 2 },
          { from: 4, to: 4 },
        ],
      },
    ]);
  });
});

const base: StoryCardInput = {
  kind: 'concept',
  title: bi('Operazioni dello stack', 'Stack operations'),
  keyPoint: bi(
    'Push aggiunge in cima, pop toglie dalla cima.',
    'Push adds on top, pop removes from the top.',
  ),
  body: bi(
    'Le tre operazioni lavorano solo sulla cima dello stack. La complessità è costante, O(1), qualunque sia la dimensione.',
    'The three operations only work on the top of the stack. Complexity is constant, O(1), whatever the size.',
  ),
  terms: ['push', 'pop'],
};

describe('storyOf', () => {
  it('concept: titolo, frase chiave e una frase per battuta', () => {
    const story = storyOf(base, 'it');
    expect(story.beats).toEqual([
      { kind: 'title' },
      { kind: 'key' },
      { kind: 'line', index: 0 },
      { kind: 'line', index: 1 },
    ]);
    expect(cut(story.keyPoint, story.blank)).toBe('Push');
    expect(story.duel).toBeNull();
    expect(story.code).toBeNull();
    expect(beatText(story, { kind: 'line', index: 1 })).toContain('O(1)');
    expect(beatText(story, { kind: 'title' })).toBe('Operazioni dello stack');
    expect(beatText(story, { kind: 'key' })).toBe(story.keyPoint);
    expect(beatText(story, { kind: 'line', index: 9 })).toBe('');
  });

  it('steps: un passo per battuta e la spiegazione come contesto', () => {
    const story = storyOf(
      {
        ...base,
        kind: 'steps',
        steps: { it: ['Crea il nodo.', 'Collegalo.'], en: ['Create.', 'Link.'] },
      },
      'en',
    );
    expect(story.beats.slice(2)).toEqual([
      { kind: 'step', index: 0 },
      { kind: 'step', index: 1 },
    ]);
    expect(story.lines).toHaveLength(2);
    expect(beatText(story, { kind: 'step', index: 1 })).toBe('Link.');
    expect(beatText(story, { kind: 'step', index: 5 })).toBe('');
    expect(storyOf({ ...base, kind: 'steps' }, 'it').steps).toEqual([]);
  });

  it('comparison: duello, una riga per battuta e la nota finale', () => {
    const story = storyOf(
      {
        ...base,
        kind: 'comparison',
        comparison: {
          left: bi('Stack', 'Stack'),
          right: bi('Queue', 'Queue'),
          rows: [
            { aspect: bi('Ordine', 'Order'), left: bi('LIFO', 'LIFO'), right: bi('FIFO', 'FIFO') },
          ],
        },
      },
      'it',
    );
    expect(story.duel).toEqual({ left: 'Stack', right: 'Queue' });
    expect(story.beats.slice(2)).toEqual([{ kind: 'row', index: 0 }, { kind: 'note' }]);
    expect(beatText(story, { kind: 'title' })).toBe('Stack vs Queue. Operazioni dello stack');
    expect(beatText(story, { kind: 'row', index: 0 })).toBe('Ordine: LIFO; FIFO');
    expect(beatText(story, { kind: 'row', index: 3 })).toBe('');
    expect(beatText(story, { kind: 'note' })).toBe(story.note);

    const bare = storyOf({ ...base, kind: 'comparison', body: bi('', '') }, 'it');
    expect(bare.beats).toEqual([{ kind: 'title' }, { kind: 'key' }]);
    expect(bare.duel).toBeNull();
  });

  it('code: una frase per battuta con le righe illuminate', () => {
    const story = storyOf(
      {
        ...base,
        kind: 'code',
        body: bi(
          'mid è il punto in cui merge_sort divide l’array. Il ciclo while copia left_half in arr.',
          'mid is the split point. The while loop copies left_half.',
        ),
        code: { language: 'python', source: mergeSort.join('\n') },
      },
      'it',
    );
    expect(story.code?.lines).toHaveLength(mergeSort.length);
    expect(story.beats.slice(2)).toEqual([
      { kind: 'code', index: 0 },
      { kind: 'code', index: 1 },
    ]);
    expect(story.explanations[0]?.lines).toEqual([{ from: 0, to: 2 }]);
    expect(beatText(story, { kind: 'code', index: 1 })).toContain('while');
    expect(beatText(story, { kind: 'code', index: 4 })).toBe('');
    expect(storyOf({ ...base, kind: 'code' }, 'it').code).toBeNull();
  });
});

describe('autoAdvanceMs', () => {
  it('cresce con il testo e ha un minimo', () => {
    expect(autoAdvanceMs('Breve')).toBe(2200);
    expect(autoAdvanceMs('x'.repeat(100))).toBe(5500);
  });
});
