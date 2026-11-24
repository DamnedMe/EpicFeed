import { checkLessonFeed } from '@epicfeed/core';
import { describe, expect, it } from 'vitest';
import {
  importSlidesRequestSchema,
  ownedLessonsResponseSchema,
  sourcePartContentSchema,
  lessonFeedDraftSchema,
  saveLessonFeedRequestSchema,
  storedLessonFeedSchema,
} from './generation.js';

const PART = '11111111-1111-4111-8111-111111111111';
const bi = (it: string, en: string) => ({ it, en });

/** Feed minimo ma realistico, come lo produrrebbe Claude. */
const feed = {
  cards: [1, 2, 3].map((n) => ({
    id: `card-${n}`,
    kind: 'concept',
    title: bi('Albero AVL', 'AVL tree'),
    keyPoint: bi('Un BST che si ribilancia da solo.', 'A self-balancing BST.'),
    body: bi('Le rotazioni mantengono l’equilibrio.', 'Rotations keep it balanced.'),
    terms: ['AVL tree'],
    conceptKeys: ['avl-tree'],
    sourcePartId: PART,
    origin: 'summary',
  })),
  quiz: [
    {
      id: 'q1',
      kind: 'multiple_choice',
      question: bi('Cosa garantisce un AVL?', 'What does an AVL guarantee?'),
      options: {
        it: ['Altezza O(log n)', 'Nulla', 'Ordine'],
        en: ['O(log n) height', 'Nothing', 'Order'],
      },
      correctIndex: 0,
      explanation: bi('Grazie alle rotazioni.', 'Thanks to rotations.'),
      conceptKey: 'avl-tree',
      difficulty: 1,
    },
    {
      id: 'q2',
      kind: 'true_false',
      question: bi('Un AVL è un BST.', 'An AVL is a BST.'),
      answer: true,
      explanation: bi('Sì, bilanciato.', 'Yes, balanced.'),
      conceptKey: 'avl-tree',
      difficulty: 2,
    },
  ],
  concepts: [
    {
      key: 'avl-tree',
      name: bi('Albero AVL', 'AVL tree'),
      description: bi('BST bilanciato', 'Balanced BST'),
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

describe('lessonFeedDraftSchema', () => {
  it('accetta un feed valido, che supera anche il controllo del core', () => {
    const parsed = lessonFeedDraftSchema.parse(feed);
    expect(checkLessonFeed(parsed, { partIds: new Set([PART]) })).toEqual([]);
  });

  it('rifiuta una lingua mancante, campi in più e testi vuoti o su più righe', () => {
    const [first] = feed.cards;
    const variants = [
      { ...first, title: { it: 'Albero AVL' } },
      { ...first, extra: true },
      { ...first, keyPoint: bi('  ', 'x') },
      { ...first, title: bi('due\nrighe', 'x') },
      { ...first, id: 'Card 1' },
      { ...first, sourcePartId: 'non-un-uuid' },
      { ...first, code: { language: 'Python 3!', source: 'x' } },
    ];
    for (const card of variants) {
      expect(lessonFeedDraftSchema.safeParse({ ...feed, cards: [card] }).success).toBe(false);
    }
  });

  it('rifiuta una domanda vero/falso con le opzioni o una difficoltà fuori scala', () => {
    const [mc, tf] = feed.quiz;
    expect(
      lessonFeedDraftSchema.safeParse({ ...feed, quiz: [{ ...tf, options: mc?.options }] }).success,
    ).toBe(false);
    expect(
      lessonFeedDraftSchema.safeParse({ ...feed, quiz: [{ ...mc, difficulty: 4 }] }).success,
    ).toBe(false);
  });

  it('normalizza gli id delle parti in minuscolo e toglie gli spazi ai bordi', () => {
    const [first] = feed.cards;
    const parsed = lessonFeedDraftSchema.parse({
      ...feed,
      cards: [
        { ...first, sourcePartId: PART.toUpperCase(), title: bi(' Albero AVL ', 'AVL tree') },
      ],
    });
    expect(parsed.cards[0]?.sourcePartId).toBe(PART);
    expect(parsed.cards[0]?.title.it).toBe('Albero AVL');
  });
});

describe('saveLessonFeedRequestSchema', () => {
  const request = {
    lessonId: '33333333-3333-4333-8333-333333333333',
    sourcesHash: 'a'.repeat(64),
    promptVersion: '2026-11-21.1',
    feed,
  };

  it('accetta una richiesta valida', () => {
    expect(saveLessonFeedRequestSchema.safeParse(request).success).toBe(true);
  });

  it('rifiuta impronta o versione del prompt non valide', () => {
    expect(saveLessonFeedRequestSchema.safeParse({ ...request, sourcesHash: 'xyz' }).success).toBe(
      false,
    );
    expect(saveLessonFeedRequestSchema.safeParse({ ...request, promptVersion: 'v1' }).success).toBe(
      false,
    );
  });
});

describe('storedLessonFeedSchema', () => {
  it('accetta il feed salvato con il tratto di video o null', () => {
    const parsed = storedLessonFeedSchema.safeParse({
      lessonId: '33333333-3333-4333-8333-333333333333',
      sourcesHash: 'a'.repeat(64),
      promptVersion: '2026-11-21.1',
      generatedAt: '2026-11-21T19:00:00.000Z',
      cards: feed.cards.map((card, i) => ({
        ...card,
        video:
          i === 0 ? { startMs: 60_000, endMs: 90_000, confidence: 0.42, language: 'it' } : null,
      })),
      quiz: feed.quiz,
      concepts: feed.concepts,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('contratti dell’API di generazione', () => {
  it('accetta le risposte tipiche e rifiuta un token del tipo sbagliato', async () => {
    const {
      createGenerateTokenResponseSchema,
      lessonSourcesResponseSchema,
      lessonsToGenerateResponseSchema,
      saveLessonFeedResponseSchema,
    } = await import('./generation.js');
    const lessonId = '33333333-3333-4333-8333-333333333333';
    expect(
      createGenerateTokenResponseSchema.safeParse({
        token: `sfg_${'A'.repeat(43)}`,
        expiresAt: '2027-02-19T19:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      createGenerateTokenResponseSchema.safeParse({
        token: `sfi_${'A'.repeat(43)}`,
        expiresAt: '2027-02-19T19:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      lessonsToGenerateResponseSchema.safeParse({
        lessons: [
          {
            lessonId,
            lessonTitle: 'Binary trees',
            chapterTitle: 'Trees',
            subjectTitle: 'DSA',
            partCount: 4,
          },
        ],
        totals: { lessons: 31, ready: 0, toGenerate: 31 },
      }).success,
    ).toBe(true);
    expect(
      lessonSourcesResponseSchema.safeParse({
        lessonId,
        sourcesHash: 'a'.repeat(64),
        lessonTitle: 'Binary trees',
        chapterTitle: 'Trees',
        subjectTitle: 'DSA',
        parts: [
          {
            lessonPartId: PART,
            title: 'AVL',
            kind: 'video',
            position: 0,
            hasSubtitles: true,
            content: { kind: 'video', summaries: { it: 'a', en: 'b' } },
          },
        ],
        glossary: feed.glossary,
      }).success,
    ).toBe(true);
    expect(
      saveLessonFeedResponseSchema.safeParse({
        feedId: lessonId,
        created: true,
        cards: 10,
        alignedCards: 7,
      }).success,
    ).toBe(true);
  });
});

describe('schemi delle slide', () => {
  const presentation = {
    number: 1,
    fileName: 'AVL trees-1.pdf',
    pages: [{ number: 1, text: 'AVL trees' }],
  };

  it('accetta un import di slide valido e lo rifiuta se malformato', () => {
    expect(importSlidesRequestSchema.safeParse({ presentations: [presentation] }).success).toBe(
      true,
    );
    expect(importSlidesRequestSchema.safeParse({ presentations: [] }).success).toBe(false);
    expect(
      importSlidesRequestSchema.safeParse({ presentations: [{ ...presentation, number: 0 }] })
        .success,
    ).toBe(false);
  });

  it('le fonti della generazione possono contenere slide', () => {
    const parsed = sourcePartContentSchema.safeParse({
      kind: 'slides',
      fileName: 'a-1.pdf',
      pages: [{ number: 1, text: '' }],
    });
    expect(parsed.success).toBe(true);
    expect(ownedLessonsResponseSchema.safeParse({ lessons: [] }).success).toBe(true);
  });
});
