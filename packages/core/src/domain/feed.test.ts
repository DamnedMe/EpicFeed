import { describe, expect, it } from 'vitest';
import type { ContentHash } from './content-hash.js';
import type { ConceptKey, FeedCard, LessonFeedDraft, QuizItem } from './feed.js';
import { checkLessonFeed, computeLessonSourcesHash, glossaryKey } from './feed.js';
import type { LessonPartId } from './ids.js';

const PART = '11111111-1111-4111-8111-111111111111' as LessonPartId;
const OTHER_PART = '22222222-2222-4222-8222-222222222222' as LessonPartId;
const context = { partIds: new Set<string>([PART]) };
const avl = 'avl-tree' as ConceptKey;
const rotation = 'tree-rotation' as ConceptKey;

const bi = (it: string, en: string) => ({ it, en });

function card(id: string, overrides: Partial<FeedCard> = {}): FeedCard {
  return {
    id,
    kind: 'concept',
    title: bi('Albero AVL', 'AVL tree'),
    keyPoint: bi('Un BST che si ribilancia da solo.', 'A self-balancing BST.'),
    body: bi(
      'Quando un inserimento rompe l’equilibrio, l’albero fa una rotazione.',
      'When an insertion breaks the balance, the tree performs a rotation.',
    ),
    terms: ['AVL tree', 'tree rotation'],
    conceptKeys: [avl],
    sourcePartId: PART,
    origin: 'summary',
    ...overrides,
  };
}

const question: QuizItem = {
  id: 'q1',
  kind: 'multiple_choice',
  question: bi('Cosa garantisce un albero AVL?', 'What does an AVL tree guarantee?'),
  options: {
    it: ['Altezza O(log n)', 'Nodi ordinati per inserimento', 'Nessuna rotazione'],
    en: ['O(log n) height', 'Nodes in insertion order', 'No rotations'],
  },
  correctIndex: 0,
  explanation: bi(
    'Le rotazioni mantengono la differenza di altezza al massimo 1.',
    'Rotations keep the height difference at most 1.',
  ),
  conceptKey: avl,
  difficulty: 1,
};

const draft: LessonFeedDraft = {
  cards: [
    card('avl'),
    card('rotation-steps', {
      kind: 'steps',
      conceptKeys: [rotation],
      steps: { it: ['Trova il nodo', 'Ruota'], en: ['Find the node', 'Rotate'] },
    }),
    card('balanced-vs-unbalanced', {
      kind: 'comparison',
      comparison: {
        left: bi('Bilanciato', 'Balanced'),
        right: bi('Sbilanciato', 'Unbalanced'),
        rows: [
          {
            aspect: bi('Ricerca', 'Search'),
            left: bi('O(log n)', 'O(log n)'),
            right: bi('O(n)', 'O(n)'),
          },
        ],
      },
    }),
    card('inorder-code', {
      kind: 'code',
      code: { language: 'python', source: 'def inorder(n): ...' },
    }),
  ],
  quiz: [
    question,
    { ...question, id: 'q2', kind: 'true_false', answer: true, conceptKey: rotation },
  ],
  concepts: [
    {
      key: avl,
      name: bi('Albero AVL', 'AVL tree'),
      description: bi('BST bilanciato', 'Balanced BST'),
    },
    {
      key: rotation,
      name: bi('Rotazione', 'Rotation'),
      description: bi('Ribilancia', 'Rebalances'),
    },
  ],
  glossary: [
    {
      term: 'balance factor',
      translation: 'fattore di bilanciamento',
      definition: bi('Differenza', 'Difference'),
    },
  ],
};

const paths = (value: LessonFeedDraft): string[] =>
  checkLessonFeed(value, context).map((i) => i.path);

describe('checkLessonFeed', () => {
  it('accetta un feed coerente', () => {
    expect(checkLessonFeed(draft, context)).toEqual([]);
  });

  it('segnala le quantità fuori dai limiti', () => {
    expect(paths({ ...draft, cards: draft.cards.slice(0, 2) })).toContain('cards');
    expect(paths({ ...draft, quiz: [question] })).toContain('quiz');
  });

  it('segnala id e chiavi ripetuti o non in kebab-case', () => {
    const result = paths({
      ...draft,
      cards: [...draft.cards, card('avl')],
      quiz: [...draft.quiz, { ...question, id: 'Q 3' }],
      concepts: [...draft.concepts, { ...(draft.concepts[0] as LessonFeedDraft['concepts'][0]) }],
      glossary: [
        ...draft.glossary,
        { ...(draft.glossary[0] as LessonFeedDraft['glossary'][0]), term: 'Balance  Factor' },
      ],
    });
    expect(result).toEqual(
      expect.arrayContaining(['cards[4].id', 'quiz[2].id', 'concepts[2].key', 'glossary[1].term']),
    );
  });

  it('segnala concetti inesistenti, non usati e parti di altre lezioni', () => {
    const orphan = { key: 'orphan' as ConceptKey, name: bi('a', 'a'), description: bi('b', 'b') };
    const result = paths({
      ...draft,
      cards: [
        card('x', { conceptKeys: ['missing' as ConceptKey], sourcePartId: OTHER_PART }),
        ...draft.cards.slice(1),
      ],
      quiz: [{ ...question, conceptKey: 'missing' as ConceptKey }, ...draft.quiz.slice(1)],
      concepts: [...draft.concepts, orphan],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'cards[0].conceptKeys[0]',
        'cards[0].sourcePartId',
        'quiz[0].conceptKey',
        'concepts[2]',
      ]),
    );
    expect(
      paths({ ...draft, cards: [card('y', { conceptKeys: [] }), ...draft.cards.slice(1)] }),
    ).toContain('cards[0].conceptKeys');
  });

  it('richiede i campi propri di ogni tipo di scheda e li vieta negli altri', () => {
    const result = paths({
      ...draft,
      cards: [
        card('a', { kind: 'steps' }),
        card('b', { kind: 'comparison' }),
        card('c', { kind: 'code' }),
        card('d', {
          steps: { it: ['x', 'y'], en: ['x', 'y'] },
          comparison: draft.cards[2]?.comparison,
        }),
      ],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'cards[0].steps',
        'cards[1].comparison',
        'cards[2].code',
        'cards[3].steps',
        'cards[3].comparison',
      ]),
    );
  });

  it('richiede lo stesso numero di passi e di opzioni nelle due lingue', () => {
    const result = paths({
      ...draft,
      cards: [
        card('s', { kind: 'steps', steps: { it: ['a', 'b', 'c'], en: ['a', 'b'] } }),
        ...draft.cards.slice(1),
      ],
      quiz: [
        { ...question, options: { it: ['a', 'b', 'c'], en: ['a', 'b', 'c', 'd'] } },
        ...draft.quiz.slice(1),
      ],
    });
    expect(result).toEqual(expect.arrayContaining(['cards[0].steps', 'quiz[0].options']));
  });

  it('segnala risposta corretta fuori dalle opzioni, opzioni uguali e righe di confronto mancanti', () => {
    const comparison = { left: bi('a', 'a'), right: bi('b', 'b'), rows: [] };
    const result = paths({
      ...draft,
      cards: [
        ...draft.cards.slice(0, 2),
        card('cmp', { kind: 'comparison', comparison }),
        ...draft.cards.slice(3),
      ],
      quiz: [
        { ...question, correctIndex: 3 },
        { ...question, id: 'q2', options: { it: ['Uno', 'uno ', 'due'], en: ['a', 'b', 'c'] } },
      ],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'cards[2].comparison.rows',
        'quiz[0].correctIndex',
        'quiz[1].options.it',
      ]),
    );
  });

  it('segnala i testi lunghi identici nelle due lingue', () => {
    const same = 'This sentence was never translated into Italian at all.';
    const result = paths({
      ...draft,
      cards: [card('u', { body: bi(same, same) }), ...draft.cards.slice(1)],
      quiz: [{ ...question, explanation: bi(same, same) }, ...draft.quiz.slice(1)],
    });
    expect(result).toEqual(expect.arrayContaining(['cards[0].body', 'quiz[0].explanation']));
  });
});

describe('glossaryKey', () => {
  it('confronta i termini senza maiuscole e spazi doppi', () => {
    expect(glossaryKey('  Balance   Factor ')).toBe('balance factor');
  });
});

describe('computeLessonSourcesHash', () => {
  const a = { lessonPartId: PART, contentHash: 'a'.repeat(64) as ContentHash };
  const b = { lessonPartId: OTHER_PART, contentHash: 'b'.repeat(64) as ContentHash };

  it('non dipende dall’ordine delle parti', async () => {
    expect(await computeLessonSourcesHash([a, b])).toBe(await computeLessonSourcesHash([b, a]));
    expect(await computeLessonSourcesHash([a, b])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia se cambia una versione', async () => {
    const changed = { ...b, contentHash: 'c'.repeat(64) as ContentHash };
    expect(await computeLessonSourcesHash([a, b])).not.toBe(
      await computeLessonSourcesHash([a, changed]),
    );
  });

  it('ordina in modo stabile anche con la stessa parte ripetuta', async () => {
    const a2 = { ...a, contentHash: 'd'.repeat(64) as ContentHash };
    expect(await computeLessonSourcesHash([a2, a])).toBe(await computeLessonSourcesHash([a, a2]));
  });
});
