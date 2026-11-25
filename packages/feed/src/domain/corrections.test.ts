import { describe, expect, it } from 'vitest';
import type {
  AnswerFix,
  CorrectableFeed,
  CorrectionDraft,
  StoredCorrection,
  TextEdit,
} from './corrections.js';
import {
  applyCorrections,
  checkCompletion,
  checkCorrectionDraft,
  countTermUsage,
  findText,
  initialClaudeStatus,
  missingLanguageEdits,
} from './corrections.js';

const LESSON = 'lesson-1';

function feed(): CorrectableFeed {
  return {
    cards: [
      {
        id: 'stack-rule',
        title: { it: 'Pile (stack)', en: 'Stacks' },
        keyPoint: { it: 'Una pila segue la regola FIFO.', en: 'A stack follows the FIFO rule.' },
        body: {
          it: 'Si inserisce in cima. Si toglie dalla cima. La Big 0 è costante.',
          en: 'You push on top. You pop from the top. Big 0 is constant.',
        },
        steps: { it: ['push', 'pop'], en: ['push', 'pop'] },
        code: { language: 'python', source: 'stack.append(1)\nstack.pop(0)' },
        terms: ['Big 0'],
      },
    ],
    quiz: [
      {
        id: 'q-pop',
        kind: 'multiple_choice',
        question: { it: 'Cosa toglie la cima?', en: 'What removes the top?' },
        explanation: { it: 'pop toglie la cima.', en: 'pop removes the top.' },
        options: { it: ['push', 'peek', 'pop'], en: ['push', 'peek', 'pop'] },
        correctIndex: 1,
      },
      {
        id: 'q-lifo',
        kind: 'true_false',
        question: { it: 'La pila è LIFO.', en: 'A stack is LIFO.' },
        explanation: { it: 'Sì.', en: 'Yes.' },
        answer: false,
      },
    ],
    concepts: [{ name: { it: 'Big 0', en: 'Big 0' }, description: { it: 'Costo', en: 'Cost' } }],
  };
}

/** Prima scheda di un feed (sempre presente nei dati di prova). */
function firstCard(value: CorrectableFeed): CorrectableFeed['cards'][number] {
  const [card] = value.cards;
  if (!card) throw new Error('Scheda mancante');
  return card;
}

function stored(id: string, correction: CorrectionDraft, extra: Partial<StoredCorrection> = {}) {
  return {
    id,
    subjectId: 'subject-1',
    correction,
    claudeStatus: initialClaudeStatus(correction),
    completion: null,
    createdAt: `2026-11-25T10:00:0${id.length % 10}.000Z`,
    ...extra,
  } satisfies StoredCorrection;
}

const textFix: CorrectionDraft = {
  kind: 'text',
  lessonId: LESSON,
  itemType: 'card',
  itemId: 'stack-rule',
  edits: [{ field: 'keyPoint', language: 'it', original: 'regola FIFO', corrected: 'regola LIFO' }],
  reason: 'content',
  snapshot: {},
};

describe('applyCorrections', () => {
  it('sostituisce la frase nella lingua corretta e segna la scheda', () => {
    const original = feed();
    const result = applyCorrections(original, LESSON, [stored('a', textFix)]);
    expect(result.feed.cards[0]?.keyPoint.it).toBe('Una pila segue la regola LIFO.');
    expect(result.feed.cards[0]?.keyPoint.en).toBe('A stack follows the FIFO rule.');
    expect(result.outcomes.get('a')).toBe('applied');
    expect(result.correctedItems.has('stack-rule')).toBe(true);
    // Il feed di partenza resta com'era.
    expect(original.cards[0]?.keyPoint.it).toContain('FIFO');
  });

  it('applica anche gli interventi di Claude nell’altra lingua', () => {
    const result = applyCorrections(feed(), LESSON, [
      stored('a', textFix, {
        claudeStatus: 'done',
        completion: {
          outcome: 'done',
          edits: [
            { field: 'keyPoint', language: 'en', original: 'FIFO rule', corrected: 'LIFO rule' },
          ],
        },
      }),
    ]);
    expect(result.feed.cards[0]?.keyPoint.en).toBe('A stack follows the LIFO rule.');
  });

  it('ignora le correzioni di altre lezioni', () => {
    const result = applyCorrections(feed(), 'other', [stored('a', textFix)]);
    expect(result.feed.cards[0]?.keyPoint.it).toContain('FIFO');
    expect(result.outcomes.size).toBe(0);
  });

  it('ritrova la frase in un elemento con un altro id (lezione rigenerata)', () => {
    const regenerated = feed();
    const moved = { ...regenerated, cards: [{ ...firstCard(regenerated), id: 'stack-rules-v2' }] };
    const result = applyCorrections(moved, LESSON, [stored('a', textFix)]);
    expect(result.feed.cards[0]?.keyPoint.it).toContain('LIFO');
    expect(result.correctedItems.has('stack-rules-v2')).toBe(true);
  });

  it('dice «già giusta» se il feed contiene la correzione e «da ricontrollare» se la frase non c’è più', () => {
    const fixed = applyCorrections(feed(), LESSON, [stored('a', textFix)]).feed;
    expect(applyCorrections(fixed, LESSON, [stored('a', textFix)]).outcomes.get('a')).toBe(
      'already',
    );
    const changed = feed();
    const other = {
      ...changed,
      cards: [{ ...firstCard(changed), keyPoint: { it: 'Altro testo', en: 'Other' } }],
    };
    expect(applyCorrections(other, LESSON, [stored('a', textFix)]).outcomes.get('a')).toBe(
      'missing',
    );
  });

  it('corregge elenchi e codice', () => {
    const result = applyCorrections(feed(), LESSON, [
      stored('a', {
        ...textFix,
        edits: [
          { field: 'steps', index: 1, language: 'en', original: 'pop', corrected: 'pop()' },
          { field: 'code', language: 'it', original: 'stack.pop(0)', corrected: 'stack.pop()' },
        ],
      }),
    ]);
    expect(result.feed.cards[0]?.steps?.en).toEqual(['push', 'pop()']);
    expect(result.feed.cards[0]?.code?.source).toBe('stack.append(1)\nstack.pop()');
  });

  it('cambia la risposta giusta di una domanda a scelta multipla e vero/falso', () => {
    const result = applyCorrections(feed(), LESSON, [
      stored('a', {
        kind: 'answer',
        lessonId: LESSON,
        itemId: 'q-pop',
        fix: { kind: 'multiple_choice', correctIndex: 2, option: { it: 'pop', en: 'pop' } },
        question: { it: 'Cosa toglie la cima?', en: 'What removes the top?' },
        reason: 'content',
        snapshot: {},
      }),
      stored('bb', {
        kind: 'answer',
        lessonId: LESSON,
        itemId: 'q-lifo',
        fix: { kind: 'true_false', answer: true },
        question: { it: 'La pila è LIFO.', en: 'A stack is LIFO.' },
        reason: 'content',
        snapshot: {},
      }),
    ]);
    const [mc, tf] = result.feed.quiz;
    expect(mc?.kind === 'multiple_choice' && mc.correctIndex).toBe(2);
    expect(tf?.kind === 'true_false' && tf.answer).toBe(true);
    expect(result.outcomes.get('a')).toBe('applied');
  });

  it('corregge un termine come parola intera in tutta la lezione, codice escluso', () => {
    const result = applyCorrections(feed(), 'any-lesson', [
      stored('a', { kind: 'term', from: 'Big 0', to: 'Big O', reason: 'content' }),
    ]);
    const card = firstCard(result.feed);
    expect(card.body.it).toContain('La Big O è costante');
    expect(card.body.en).toContain('Big O is constant');
    expect(card.terms).toEqual(['Big O']);
    expect(result.feed.concepts[0]?.name.it).toBe('Big O');
    expect(result.correctedItems.has('stack-rule')).toBe(true);
  });

  it('una scheda da rifare non cambia finché Claude non la completa', () => {
    const draft: CorrectionDraft = {
      kind: 'regenerate',
      lessonId: LESSON,
      itemType: 'card',
      itemId: 'stack-rule',
      reason: 'unclear',
      snapshot: {},
    };
    expect(applyCorrections(feed(), LESSON, [stored('a', draft)]).outcomes.size).toBe(0);
    const done = applyCorrections(feed(), LESSON, [
      stored('a', draft, {
        claudeStatus: 'done',
        completion: {
          outcome: 'done',
          edits: [
            { field: 'title', language: 'it', original: 'Pile (stack)', corrected: 'Pila (stack)' },
          ],
        },
      }),
    ]);
    expect(done.feed.cards[0]?.title.it).toBe('Pila (stack)');
  });
});

describe('applyCorrections su confronti e domande', () => {
  const comparisonFeed = (): CorrectableFeed => ({
    cards: [
      {
        id: 'stack-vs-queue',
        title: { it: 'Pila o coda', en: 'Stack or queue' },
        keyPoint: { it: 'Due regole.', en: 'Two rules.' },
        body: { it: 'Cambia l’ordine.', en: 'Order changes.' },
        comparison: {
          left: { it: 'Pila', en: 'Stack' },
          right: { it: 'Coda', en: 'Queue' },
          rows: [
            {
              aspect: { it: 'Regola', en: 'Rule' },
              left: { it: 'FIFO', en: 'FIFO' },
              right: { it: 'LIFO', en: 'LIFO' },
            },
          ],
        },
        terms: [],
      },
    ],
    quiz: [],
    concepts: [],
  });
  const edit = (field: TextEdit['field'], original: string, corrected: string, index?: number) =>
    stored(`c-${field}`, {
      ...textFix,
      itemId: 'stack-vs-queue',
      edits: [{ field, index, language: 'it', original, corrected }],
    });

  it('corregge intestazioni e celle del confronto', () => {
    const result = applyCorrections(comparisonFeed(), LESSON, [
      edit('comparisonLeft', 'Pila', 'Pila (stack)'),
      edit('comparisonRight', 'Coda', 'Coda (queue)'),
      edit('rowAspect', 'Regola', 'Ordine', 0),
      edit('rowLeft', 'FIFO', 'LIFO', 0),
      edit('rowRight', 'LIFO', 'FIFO', 0),
    ]);
    const comparison = firstCard(result.feed).comparison;
    expect(comparison?.left.it).toBe('Pila (stack)');
    expect(comparison?.right.it).toBe('Coda (queue)');
    expect(comparison?.rows[0]).toMatchObject({
      aspect: { it: 'Ordine' },
      left: { it: 'LIFO' },
      right: { it: 'FIFO' },
    });
  });

  it('un campo che la scheda non ha resta da ricontrollare', () => {
    const result = applyCorrections(feed(), LESSON, [
      stored('a', {
        ...textFix,
        edits: [{ field: 'rowLeft', index: 3, language: 'it', original: 'x', corrected: 'y' }],
      }),
      stored('bb', {
        ...textFix,
        edits: [{ field: 'comparisonLeft', language: 'it', original: 'x', corrected: 'y' }],
      }),
      stored('ccc', {
        ...textFix,
        edits: [{ field: 'steps', index: 9, language: 'it', original: 'x', corrected: 'y' }],
      }),
    ]);
    expect([...result.outcomes.values()]).toEqual(['missing', 'missing', 'missing']);
  });

  it('corregge testo e opzioni delle domande e sostituisce i termini anche lì', () => {
    const result = applyCorrections(feed(), LESSON, [
      stored('a', {
        ...textFix,
        itemType: 'quiz',
        itemId: 'q-pop',
        edits: [
          {
            field: 'question',
            language: 'it',
            original: 'la cima',
            corrected: 'l’elemento in cima',
          },
          { field: 'options', index: 1, language: 'en', original: 'peek', corrected: 'peek()' },
        ],
      }),
      stored('bb', { kind: 'term', from: 'pop', to: 'pop()', reason: 'code' }),
    ]);
    const [mc] = result.feed.quiz;
    expect(mc?.question.it).toBe('Cosa toglie l’elemento in cima?');
    expect(mc?.kind === 'multiple_choice' && mc.options.en).toEqual(['push', 'peek()', 'pop()']);
  });

  it('risposte già giuste, opzioni sparite e tipi diversi', () => {
    const answer = (
      id: string,
      fix: AnswerFix,
      question = { it: 'Cosa toglie la cima?', en: '' },
    ) =>
      stored(id, {
        kind: 'answer',
        lessonId: LESSON,
        itemId: 'q-pop',
        fix,
        question,
        reason: 'content',
        snapshot: {},
      });
    const result = applyCorrections(feed(), LESSON, [
      answer('mc-same', {
        kind: 'multiple_choice',
        correctIndex: 1,
        option: { it: 'peek', en: 'peek' },
      }),
      answer('mc-gone', {
        kind: 'multiple_choice',
        correctIndex: 3,
        option: { it: 'size', en: 'size' },
      }),
      answer('tf-on-mc', { kind: 'true_false', answer: true }),
      answer('tf-same', { kind: 'true_false', answer: false }, { it: 'La pila è LIFO.', en: '' }),
      answer(
        'tf-gone',
        { kind: 'true_false', answer: true },
        { it: 'Domanda sparita', en: 'Gone' },
      ),
    ]);
    expect(Object.fromEntries(result.outcomes)).toEqual({
      'mc-same': 'already',
      'mc-gone': 'missing',
      'tf-on-mc': 'missing',
      'tf-same': 'already',
      'tf-gone': 'missing',
    });
  });
});

describe('findText', () => {
  it('trova una frase anche se il campo ha a capo o spazi doppi', () => {
    expect(findText('Uno.\n\nDue  parole qui.', 'Due parole qui.')).toEqual({ start: 6, end: 22 });
    expect(findText('abc', 'abc')).toEqual({ start: 0, end: 3 });
    expect(findText('abc', 'x (y)')).toBeNull();
    expect(findText('abc', '   ')).toBeNull();
  });
});

describe('regole delle correzioni', () => {
  it('chiede a Claude solo l’altra lingua mancante', () => {
    expect(initialClaudeStatus(textFix)).toBe('pending');
    expect(
      initialClaudeStatus({
        ...textFix,
        edits: [{ field: 'code', language: 'it', original: 'a', corrected: 'b' }],
      }),
    ).toBe('not_needed');
    expect(initialClaudeStatus({ kind: 'term', from: 'a', to: 'b', reason: 'content' })).toBe(
      'not_needed',
    );
    expect(
      missingLanguageEdits([
        { field: 'keyPoint', language: 'it', original: 'regola FIFO', corrected: 'regola LIFO' },
      ]),
    ).toHaveLength(1);
  });

  it('rifiuta campi non validi, posizioni mancanti e testo invariato', () => {
    const issues = checkCorrectionDraft({
      ...textFix,
      edits: [
        { field: 'question', language: 'it', original: 'a', corrected: 'b' },
        { field: 'steps', language: 'it', original: 'a', corrected: 'b' },
        { field: 'body', language: 'it', original: 'a', corrected: 'a' },
      ],
    });
    expect(issues.map((i) => i.path)).toEqual([
      'edits.0.field',
      'edits.1.index',
      'edits.2.corrected',
    ]);
    expect(
      checkCorrectionDraft({ kind: 'term', from: 'x', to: 'x', reason: 'content' }),
    ).toHaveLength(1);
  });

  it('non accetta lavoro di Claude su risposte e termini', () => {
    expect(
      checkCompletion(
        { kind: 'term', from: 'a', to: 'b', reason: 'content' },
        {
          outcome: 'done',
          edits: [{ field: 'body', language: 'it', original: 'a', corrected: 'b' }],
        },
      )[0]?.path,
    ).toBe('outcome');
  });

  it('pretende da Claude la stessa frase nell’altra lingua', () => {
    expect(checkCompletion(textFix, { outcome: 'done', edits: [] }).length).toBeGreaterThan(0);
    expect(
      checkCompletion(textFix, {
        outcome: 'done',
        edits: [{ field: 'keyPoint', language: 'en', original: 'FIFO', corrected: 'LIFO' }],
      }),
    ).toEqual([]);
    expect(
      checkCompletion(textFix, { outcome: 'disputed', note: 'Il riassunto dice FIFO' }),
    ).toEqual([]);
  });
});

describe('countTermUsage', () => {
  it('conta schede, domande e lezioni che contengono il termine', () => {
    const usage = countTermUsage(
      [
        { title: 'Pile e code', feed: feed() },
        { title: 'Senza termine', feed: { cards: [], quiz: [], concepts: [] } },
      ],
      'Big 0',
    );
    expect(usage).toEqual({ items: 1, lessons: 1, lessonTitles: ['Pile e code'] });
    expect(countTermUsage([{ title: 'x', feed: feed() }], '  ').items).toBe(0);
  });
});
