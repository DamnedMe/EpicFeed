import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LessonForExamResponse } from '@study-feed/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-client.js';
import { EXAM_PROMPT_VERSION } from './exam-prompt.js';
import type { ExamApi } from './exam-tools.js';
import { formatLessonForExam, registerExamTools } from './exam-tools.js';

const lessonId = '10000000-0000-4000-8000-000000000001';
const feedId = '60000000-0000-4000-8000-000000000001';

const lesson: LessonForExamResponse = {
  lessonId,
  feedId,
  lessonTitle: 'Stacks',
  chapterTitle: 'Linear structures',
  subjectTitle: 'DSA',
  hasExamPack: false,
  concepts: [{ key: 'stack', name: 'Stack', description: 'A LIFO collection.' }],
  cards: [
    {
      title: 'Stack',
      keyPoint: 'Last in, first out.',
      body: 'Push and pop at the top.',
      steps: ['Push', 'Pop'],
      code: { language: 'python', source: 'stack.append(1)' },
      conceptKeys: ['stack'],
    },
  ],
  feedQuestions: ['Is a stack LIFO?'],
};

const pack = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `q-${String(i)}`,
    question: `Which operation ${String(i)} removes the top?`,
    options: ['push', 'pop', 'peek', 'size'],
    correctIndex: 1,
    explanation: 'pop removes the top.',
    conceptKey: 'stack',
    difficulty: 2,
  })),
  openQuestions: [
    {
      id: 'explain-lifo',
      kind: 'explain',
      prompt: 'Explain LIFO with an example.',
      hints: [{ it: 'Pensa ai piatti.', en: 'Think of plates.' }],
      modelAnswer: 'The last element pushed is the first popped.',
      rubric: [
        { criterion: 'Defines LIFO', points: 2 },
        { criterion: 'Gives an example', points: 2 },
        { criterion: 'Names push and pop', points: 1 },
      ],
      conceptKeys: ['stack'],
      followUp: 'Where does the interpreter use a stack?',
    },
  ],
};

async function connect(overrides: Partial<ExamApi> = {}) {
  const api: ExamApi = {
    listExamLessons: vi.fn(() =>
      Promise.resolve({
        lessons: [{ lessonId, lessonTitle: 'Stacks', chapterTitle: 'Linear', subjectTitle: 'DSA' }],
        totals: { lessons: 3, ready: 1, toGenerate: 2 },
      }),
    ),
    readLessonForExam: vi.fn(() => Promise.resolve(lesson)),
    saveExamPack: vi.fn(() =>
      Promise.resolve({ packId: feedId, created: true, questions: 10, openQuestions: 1 }),
    ),
    ...overrides,
  };
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  registerExamTools(server, api);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { text?: string }[];
    return {
      isError: result.isError === true,
      text: content.flatMap((c) => (c.text === undefined ? [] : [c.text])).join('\n'),
    };
  };
  return { api, client, call };
}

describe("strumenti d'esame", () => {
  it('elenca le lezioni da completare con i totali', async () => {
    const { call } = await connect();
    const result = await call('lezioni_per_esame', { limite: 1 });
    expect(result.text).toContain('da completare: 2');
    expect(result.text).toContain(`lessonId: ${lessonId}`);
    expect(result.text).toContain('e altre 1');
  });

  it('legge il feed con le istruzioni e salva un pacchetto valido', async () => {
    const { api, call } = await connect();
    const read = await call('leggi_lezione_esame', { lessonId });
    expect(read.text).toContain(`feedId: ${feedId}`);
    expect(read.text).toContain(EXAM_PROMPT_VERSION);
    const saved = await call('salva_domande_esame', { lessonId, feedId, pack });
    expect(saved).toEqual({
      isError: false,
      text: "Domande d'esame salvate: 10 a scelta multipla e 1 aperte.",
    });
    expect(api.saveExamPack).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId, feedId, promptVersion: EXAM_PROMPT_VERSION }),
    );
  });

  it('ferma in locale un pacchetto con concetti sconosciuti o domande del feed', async () => {
    const { api, call } = await connect();
    await call('leggi_lezione_esame', { lessonId });
    const questions = pack.questions.map((q, i) =>
      i === 0 ? { ...q, question: 'Is a stack LIFO?', conceptKey: 'queue' } : q,
    );
    const result = await call('salva_domande_esame', {
      lessonId,
      feedId,
      pack: { ...pack, questions },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('questions[0].conceptKey');
    expect(result.text).toContain('questions[0].question');
    expect(result.text).toContain('salva_domande_esame');
    expect(api.saveExamPack).not.toHaveBeenCalled();
  });

  it('spiega un feed cambiato e i problemi trovati dall’API', async () => {
    const { call } = await connect({
      saveExamPack: () => Promise.reject(new ApiRequestError(409, 'CONFLICT', 'Feed cambiato.')),
    });
    const conflict = await call('salva_domande_esame', { lessonId, feedId, pack });
    expect(conflict.text).toContain('leggi_lezione_esame');
    const { call: call2 } = await connect({
      saveExamPack: () =>
        Promise.reject(
          new ApiRequestError(422, 'INVALID_FEED', 'No.', [
            { path: 'openQuestions', message: 'x' },
          ]),
        ),
    });
    const invalid = await call2('salva_domande_esame', { lessonId, feedId, pack });
    expect(invalid.text).toContain('Il pacchetto non è stato salvato');
  });

  it('offre il prompt genera_domande_esame', async () => {
    const { client } = await connect();
    const prompt = await client.getPrompt({ name: 'genera_domande_esame' });
    expect((prompt.messages[0]?.content as { text: string }).text).toContain('salva_domande_esame');
  });
});

describe('formatLessonForExam', () => {
  it('include id, concetti, schede con codice e domande del feed', () => {
    const out = formatLessonForExam({ ...lesson, hasExamPack: true });
    expect(out).toContain(`lessonId: ${lessonId}`);
    expect(out).toContain('- stack: Stack. A LIFO collection.');
    expect(out).toContain('```python\nstack.append(1)\n```');
    expect(out).toContain('1. Push');
    expect(out).toContain('- Is a stack LIFO?');
    expect(out).toContain('già le domande');
  });
});
