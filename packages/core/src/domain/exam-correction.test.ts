import { describe, expect, it } from 'vitest';
import type {
  ExamCorrectionDraft,
  ExamSubmissionDraft,
  SubmissionItem,
} from './exam-correction.js';
import { checkCorrection, lineCount, suggestionDiff } from './exam-correction.js';

const answer = [
  'def visit(graph, start):',
  '    seen = []',
  '    stack = [start]',
  '    return seen',
].join('\n');

const item: SubmissionItem = {
  key: 'bank:dfs',
  kind: 'code',
  prompt: 'Write visit(graph, start).',
  code: null,
  answer,
  followUp: null,
  followUpAnswer: null,
  modelAnswer: 'def visit(graph, start): ...',
  rubric: [
    { criterion: 'Correct', points: 3 },
    { criterion: 'Complexity', points: 2 },
  ],
  conceptKeys: ['dfs'],
  tests: { passed: 1, total: 3 },
};

const submission: ExamSubmissionDraft = {
  subjectId: '00000000-0000-4000-8000-000000000001',
  kind: 'exercise',
  items: [item],
};

const good: ExamCorrectionDraft = {
  summary: 'Almost there.',
  items: [
    {
      key: 'bank:dfs',
      scores: [2, 1],
      comment: 'Membership checks on a list are O(n).',
      suggestions: [
        {
          title: 'Use a set for visited nodes',
          explanation: 'A set gives O(1) membership checks.',
          fromLine: 2,
          toLine: 2,
          replacement: '    seen = set()',
        },
      ],
    },
  ],
};

describe('checkCorrection', () => {
  it('accetta una correzione coerente con l’invio', () => {
    expect(checkCorrection(good, submission)).toEqual([]);
  });

  it('segnala punti fuori griglia, domande mancanti o sconosciute', () => {
    const issues = checkCorrection(
      {
        summary: '',
        items: [
          { key: 'bank:dfs', scores: [4], comment: '', suggestions: [] },
          { key: 'bank:other', scores: [], comment: '', suggestions: [] },
        ],
      },
      submission,
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      'items[0].scores',
      'items[0].scores[0]',
      'items[1].key',
    ]);
    expect(checkCorrection({ summary: '', items: [] }, submission)[0]?.message).toContain(
      'Manca la correzione',
    );
  });

  it('segnala righe inesistenti, sovrapposte o sostituzioni identiche', () => {
    const suggestion = (fromLine: number, toLine: number, replacement = 'x') => ({
      title: 't',
      explanation: 'e',
      fromLine,
      toLine,
      replacement,
    });
    const issues = checkCorrection(
      {
        summary: '',
        items: [
          {
            key: 'bank:dfs',
            scores: [3, 2],
            comment: '',
            suggestions: [
              suggestion(3, 9),
              suggestion(3, 3),
              suggestion(0, 1),
              suggestion(4, 4, '    return seen'),
            ],
          },
        ],
      },
      submission,
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      'Righe non valide: 0–1',
      'La risposta ha 4 righe, il suggerimento arriva alla 9',
      'Si sovrappone a un altro suggerimento (riga 3)',
      'Si sovrappone a un altro suggerimento (riga 4)',
      'La sostituzione è uguale al testo originale',
    ]);
  });
});

describe('suggestionDiff', () => {
  it('mostra contesto, riga tolta e riga aggiunta con i numeri giusti', () => {
    expect(
      suggestionDiff(answer, { fromLine: 2, toLine: 2, replacement: '    seen = set()' }, 1),
    ).toEqual([
      { type: 'context', oldLine: 1, newLine: 1, text: 'def visit(graph, start):' },
      { type: 'removed', oldLine: 2, newLine: null, text: '    seen = []' },
      { type: 'added', oldLine: null, newLine: 2, text: '    seen = set()' },
      { type: 'context', oldLine: 3, newLine: 3, text: '    stack = [start]' },
    ]);
  });

  it('con più righe aggiunte sposta la numerazione dopo', () => {
    const diff = suggestionDiff(answer, { fromLine: 3, toLine: 3, replacement: 'a\nb' }, 1);
    expect(diff.at(-1)).toEqual({
      type: 'context',
      oldLine: 4,
      newLine: 5,
      text: '    return seen',
    });
  });

  it('una sostituzione vuota toglie le righe', () => {
    const diff = suggestionDiff(answer, { fromLine: 4, toLine: 4, replacement: '' }, 0);
    expect(diff).toEqual([{ type: 'removed', oldLine: 4, newLine: null, text: '    return seen' }]);
    expect(lineCount('')).toBe(1);
  });
});
