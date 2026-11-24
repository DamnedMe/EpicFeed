import { describe, expect, it } from 'vitest';
import type { ExamChoiceQuestion, ExamExercise, ExamOpenQuestion, ExamPackDraft } from './exam.js';
import { checkExamBank, checkExamPack } from './exam.js';
import type { ConceptKey } from '@epicfeed/feed';

const key = (value: string) => value as ConceptKey;

const choice = (id: string, question = `What does ${id} do?`): ExamChoiceQuestion => ({
  id,
  question,
  options: ['push', 'pop', 'peek', 'size'],
  correctIndex: 1,
  explanation: 'Because.',
  conceptKey: key('stack'),
  difficulty: 2,
});

const open = (overrides: Partial<ExamOpenQuestion> = {}): ExamOpenQuestion => ({
  id: 'balanced',
  kind: 'code',
  prompt: 'Write `is_balanced`.',
  signature: 'def is_balanced(s: str) -> bool:',
  tests: [
    { call: 'is_balanced("([])")', expected: 'True' },
    { call: 'is_balanced("(]")', expected: 'False' },
  ],
  hints: [{ it: 'Usa una pila.', en: 'Use a stack.' }],
  modelAnswer: '```python\n...\n```',
  rubric: [
    { criterion: 'Uses a stack', points: 2 },
    { criterion: 'Handles empty input', points: 1 },
    { criterion: 'Linear time', points: 2 },
  ],
  conceptKeys: [key('stack')],
  followUp: 'What is the complexity?',
  ...overrides,
});

const pack = (overrides: Partial<ExamPackDraft> = {}): ExamPackDraft => ({
  questions: Array.from({ length: 10 }, (_, i) => choice(`q-${i}`)),
  openQuestions: [open()],
  ...overrides,
});

const context = {
  conceptKeys: new Set(['stack', 'queue']),
  feedQuestions: ['What is a stack?'],
};

const paths = (draft: ExamPackDraft) => checkExamPack(draft, context).map((issue) => issue.path);

describe('checkExamPack', () => {
  it('accetta un pacchetto coerente', () => {
    expect(checkExamPack(pack(), context)).toEqual([]);
  });

  it('controlla le quantità', () => {
    expect(paths(pack({ questions: [choice('a')], openQuestions: [] }))).toEqual([
      'questions',
      'openQuestions',
    ]);
  });

  it('vuole id in kebab-case e unici fra domande chiuse e aperte', () => {
    const questions = pack().questions.map((q, i) => (i === 0 ? { ...q, id: 'Bad_Id' } : q));
    expect(paths(pack({ questions }))).toEqual(['questions[0].id']);
    const clash = pack({ openQuestions: [open({ id: 'q-3' })] });
    expect(paths(clash)).toEqual(['openQuestions[0].id']);
  });

  it('controlla opzioni, risposta, concetto e domande ripetute', () => {
    const questions = [...pack().questions];
    questions[0] = { ...choice('a'), options: ['x', 'X', 'y', 'z'] };
    questions[1] = { ...choice('b'), correctIndex: 4 };
    questions[2] = { ...choice('c'), conceptKey: key('heap') };
    questions[3] = choice('d', 'What is a stack');
    questions[4] = choice('e', questions[5]?.question);
    expect(paths(pack({ questions }))).toEqual([
      'questions[0].options',
      'questions[1].correctIndex',
      'questions[2].conceptKey',
      'questions[3].question',
      'questions[5].question',
    ]);
  });

  it('vuole firma e test per il codice, niente test altrove, codice per l’analisi', () => {
    expect(paths(pack({ openQuestions: [open({ signature: undefined, tests: [] })] }))).toEqual([
      'openQuestions[0].signature',
      'openQuestions[0].tests',
    ]);
    expect(paths(pack({ openQuestions: [open({ kind: 'explain' })] }))).toEqual([
      'openQuestions[0].tests',
    ]);
    expect(
      paths(
        pack({
          openQuestions: [open({ kind: 'analyze', tests: undefined, signature: undefined })],
        }),
      ),
    ).toEqual(['openQuestions[0].code']);
  });

  it('controlla suggerimenti, griglia e concetti delle domande aperte', () => {
    const bad = open({
      hints: [],
      rubric: [
        { criterion: 'a', points: 0 },
        { criterion: 'b', points: 6 },
      ],
      conceptKeys: [key('heap')],
    });
    expect(paths(pack({ openQuestions: [bad] }))).toEqual([
      'openQuestions[0].hints',
      'openQuestions[0].rubric',
      'openQuestions[0].rubric[0].points',
      'openQuestions[0].rubric[1].points',
      'openQuestions[0].conceptKeys[0]',
    ]);
  });
});

describe('checkExamBank', () => {
  const exercise = (id: string, overrides: Partial<ExamExercise> = {}): ExamExercise => ({
    ...open({ id }),
    title: `Exercise ${id}`,
    origin: 'official',
    page: 2,
    ...overrides,
  });
  const bank = (extra: ExamExercise[] = []) => ({
    exercises: [
      exercise('balanced'),
      exercise('balanced-v1', { origin: 'variant', variantOf: 'balanced' }),
      exercise('balanced-v2', { origin: 'variant', variantOf: 'balanced' }),
      ...extra,
    ],
  });
  const keys = new Set(['stack']);
  const bankPaths = (draft: { exercises: ExamExercise[] }) =>
    checkExamBank(draft, keys).map((issue) => issue.path);

  it('accetta ufficiali con due varianti ciascuno', () => {
    expect(checkExamBank(bank(), keys)).toEqual([]);
  });

  it('vuole due varianti per ufficiale, riferite a un ufficiale esistente', () => {
    expect(bankPaths(bank([exercise('queue')]))).toEqual(['exercises[3]']);
    expect(bankPaths(bank([exercise('orphan', { origin: 'variant', variantOf: 'nope' })]))).toEqual(
      ['exercises[3].variantOf'],
    );
    expect(bankPaths(bank([exercise('x', { variantOf: 'balanced' })]))).toEqual([
      'exercises[3].variantOf',
      'exercises[3]',
    ]);
  });

  it('controlla id, pagina e regole delle domande aperte', () => {
    const issues = checkExamBank(
      bank([exercise('balanced', { page: 0, conceptKeys: [key('heap')] })]),
      keys,
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      'exercises[3].id',
      'exercises[3].page',
      'exercises[3].conceptKeys[0]',
    ]);
    expect(issues[2]?.message).toContain('nei feed della materia');
  });
});
