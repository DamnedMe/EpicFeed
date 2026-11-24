import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { ExamBankApi } from './bank-tools.js';
import { registerExamBankTools } from './bank-tools.js';
import { EXAM_BANK_PROMPT_VERSION } from './prompt.js';
import { memorySlidesToolkit } from '../feed/slides/testing.js';

const dsa = '40000000-0000-4000-8000-000000000001';
const web = '40000000-0000-4000-8000-000000000002';

const subjects = [
  {
    subjectId: dsa,
    subjectTitle: 'Data Structures and Algorithms',
    concepts: [{ key: 'stack', name: 'Stack', description: 'LIFO.' }],
    hasBank: false,
  },
  { subjectId: web, subjectTitle: 'Web Development', concepts: [], hasBank: false },
];

const pdfs = {
  'Stacks-1.pdf': 'Stacks',
  'Exam Prep-1.pdf': 'Exercise 1: balanced brackets\n[figura]',
};

const exercise = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'explain',
  title: 'LIFO',
  prompt: 'Explain LIFO.',
  hints: [{ it: 'Piatti.', en: 'Plates.' }],
  modelAnswer: 'Last in, first out.',
  rubric: [
    { criterion: 'Defines LIFO', points: 2 },
    { criterion: 'Example', points: 2 },
    { criterion: 'Operations', points: 1 },
  ],
  conceptKeys: ['stack'],
  followUp: 'Where is a stack used?',
  origin: 'official',
  page: 1,
  ...extra,
});

const bank = {
  exercises: [
    exercise('lifo'),
    exercise('lifo-a', { origin: 'variant', variantOf: 'lifo' }),
    exercise('lifo-b', { origin: 'variant', variantOf: 'lifo' }),
  ],
};

async function connect(files: Record<string, string> = pdfs, overrides: Partial<ExamBankApi> = {}) {
  const api: ExamBankApi = {
    listExamSubjects: vi.fn(() => Promise.resolve({ subjects })),
    listCatalog: vi.fn(() =>
      Promise.resolve({
        lessons: [
          {
            lessonId: '10000000-0000-4000-8000-000000000001',
            lessonTitle: 'Stacks',
            chapterTitle: 'Linear',
            subjectTitle: 'Data Structures and Algorithms',
            slides: 1,
          },
        ],
      }),
    ),
    saveExamBank: vi.fn(() =>
      Promise.resolve({ bankId: dsa, created: true, officials: 1, variants: 2 }),
    ),
    ...overrides,
  };
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  registerExamBankTools(server, api, memorySlidesToolkit(files).kit);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text?: string }[];
    return {
      isError: result.isError === true,
      text: content.flatMap((c) => (c.text === undefined ? [] : [c.text])).join('\n'),
      images: content.filter((c) => c.type === 'image').length,
    };
  };
  return { api, call };
}

describe("banca d'esame", () => {
  it('legge il materiale, riconosce la materia dallo zip e mostra le pagine', async () => {
    const { call } = await connect();
    const read = await call('leggi_materiale_esame', { percorso: 'C:\\slides.zip' });
    expect(read.isError).toBe(false);
    expect(read.text).toContain(`subjectId: ${dsa}`);
    expect(read.text).toContain('- stack: Stack. LIFO.');
    expect(read.text).toContain('Exercise 1: balanced brackets');
    expect(read.text).toContain('Figura: Exam Prep-1.pdf, pagina 2');
    expect(read.text).toContain(EXAM_BANK_PROMPT_VERSION);
    expect(read.images).toBe(2);
  });

  it('salva una banca valida e ferma in locale una banca incoerente', async () => {
    const { api, call } = await connect();
    await call('leggi_materiale_esame', { percorso: 'C:\\slides.zip' });
    const bad = await call('salva_esercizi_esame', {
      subjectId: dsa,
      bank: { exercises: bank.exercises.slice(0, 2) },
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('salva_esercizi_esame');
    expect(api.saveExamBank).not.toHaveBeenCalled();
    const saved = await call('salva_esercizi_esame', { subjectId: dsa, bank });
    expect(saved.text).toBe("Banca d'esame salvata: 1 esercizi ufficiali e 2 varianti.");
    expect(api.saveExamBank).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: dsa, promptVersion: EXAM_BANK_PROMPT_VERSION }),
    );
  });

  it('usa la materia indicata e spiega quando manca il materiale o la materia', async () => {
    const { call } = await connect({ 'Exam Prep-1.pdf': 'x' });
    expect((await call('leggi_materiale_esame', { percorso: 'z', materia: 'web' })).text).toContain(
      `subjectId: ${web}`,
    );
    expect(
      (await call('leggi_materiale_esame', { percorso: 'z', materia: 'nope' })).text,
    ).toContain('non trovata');
    expect((await call('leggi_materiale_esame', { percorso: 'z' })).text).toContain(
      'Non riconosco la materia',
    );
    const { call: none } = await connect({ 'Stacks-1.pdf': 'x' });
    expect((await none('leggi_materiale_esame', { percorso: 'z' })).isError).toBe(true);
    const { call: empty } = await connect(pdfs, {
      listExamSubjects: () => Promise.resolve({ subjects: [] }),
    });
    expect((await empty('leggi_materiale_esame', { percorso: 'z' })).text).toContain(
      'genera prima le lezioni',
    );
  });
});
