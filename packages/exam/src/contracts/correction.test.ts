import { describe, expect, it } from 'vitest';
import {
  examCorrectionSchema,
  examSubmissionRequestSchema,
  storedSubmissionSchema,
} from './correction.js';

const item = {
  key: 'bank:dfs',
  kind: 'code',
  prompt: 'Write visit(graph, start).',
  code: null,
  answer: 'def visit(graph, start):\n    seen = []\n',
  followUp: null,
  followUpAnswer: null,
  modelAnswer: 'def visit(graph, start): ...',
  rubric: [{ criterion: 'Correct', points: 3 }],
  conceptKeys: ['dfs'],
  tests: { passed: 1, total: 2 },
};
const request = {
  subjectId: '00000000-0000-4000-8000-000000000001',
  kind: 'exercise',
  items: [item],
};
const correction = {
  summary: 'Close.',
  items: [
    {
      key: 'bank:dfs',
      scores: [2],
      comment: 'Use a set.',
      suggestions: [
        {
          title: 'Use a set for visited nodes',
          explanation: 'O(1) membership.',
          fromLine: 2,
          toLine: 2,
          replacement: '    seen = set()',
        },
      ],
    },
  ],
};

describe('contratti della correzione', () => {
  it('conserva indentazione e spazi della risposta e delle sostituzioni', () => {
    const parsed = examSubmissionRequestSchema.parse(request);
    expect(parsed.items[0]?.answer).toBe(item.answer);
    expect(examCorrectionSchema.parse(correction).items[0]?.suggestions[0]?.replacement).toBe(
      '    seen = set()',
    );
  });

  it('rifiuta risposte vuote, tipi sconosciuti e campi in più', () => {
    const bad = (items: unknown[]) => examSubmissionRequestSchema.safeParse({ ...request, items });
    expect(bad([{ ...item, answer: '   ' }]).success).toBe(false);
    expect(bad([]).success).toBe(false);
    expect(examSubmissionRequestSchema.safeParse({ ...request, kind: 'quiz' }).success).toBe(false);
    expect(examCorrectionSchema.safeParse({ ...correction, extra: 1 }).success).toBe(false);
  });

  it('legge un invio salvato con la correzione', () => {
    expect(
      storedSubmissionSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000002',
        subjectId: request.subjectId,
        kind: 'exercise',
        submission: request,
        correction,
        createdAt: '2026-11-24T10:00:00.000Z',
        correctedAt: '2026-11-24T11:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
