import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { StoredSubmissionResponse } from '@study-feed/contracts';
import { CORRECTION_PROMPT_VERSION } from './correction-prompt.js';
import type { CorrectionApi } from './correction-tools.js';
import { formatSubmission, registerCorrectionTools } from './correction-tools.js';

const id = '50000000-0000-4000-8000-000000000001';
const subjectId = '40000000-0000-4000-8000-000000000001';

const stored: StoredSubmissionResponse = {
  id,
  subjectId,
  kind: 'exercise',
  createdAt: '2026-11-24T10:00:00.000Z',
  correctedAt: null,
  correction: null,
  submission: {
    subjectId,
    kind: 'exercise',
    items: [
      {
        key: 'bank:dfs',
        kind: 'code',
        prompt: 'Write visit(graph, start).',
        code: null,
        answer: 'def visit(graph, start):\n    seen = []\n    return seen',
        followUp: null,
        followUpAnswer: null,
        modelAnswer: 'def visit(graph, start): ...',
        rubric: [
          { criterion: 'Correct', points: 3 },
          { criterion: 'Complexity', points: 2 },
        ],
        conceptKeys: ['dfs'],
        tests: { passed: 1, total: 3 },
      },
    ],
  },
};

const correction = (fromLine: number) => ({
  summary: 'Almost there.',
  items: [
    {
      key: 'bank:dfs',
      scores: [2, 1],
      comment: 'Lists make membership O(n).',
      suggestions: [
        {
          title: 'Use a set for visited nodes',
          explanation: 'O(1) membership checks.',
          fromLine,
          toLine: fromLine,
          replacement: '    seen = set()',
        },
      ],
    },
  ],
});

async function connect(submissions: StoredSubmissionResponse[] = [stored]) {
  const api: CorrectionApi = {
    listSubmissionsToCorrect: vi.fn(() => Promise.resolve({ submissions })),
    saveCorrection: vi.fn(() => Promise.resolve()),
  };
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  registerCorrectionTools(server, api);
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
  return { api, call, client };
}

describe('correzione di Claude', () => {
  it('mostra gli invii con le righe numerate, la griglia e le istruzioni', async () => {
    const { call } = await connect();
    const listed = await call('risposte_da_correggere');
    expect(listed.text).toContain(`id: ${id}`);
    expect(listed.text).toContain('2 |     seen = []');
    expect(listed.text).toContain('Test nel browser: 1 su 3 superati.');
    expect(listed.text).toContain('2. Complexity — 2 punti');
    expect(listed.text).toContain(CORRECTION_PROMPT_VERSION);
  });

  it('senza invii lo dice', async () => {
    const { call } = await connect([]);
    expect((await call('risposte_da_correggere')).text).toContain('Non ci sono risposte');
  });

  it('ferma in locale una correzione su righe che non esistono, poi salva', async () => {
    const { api, call } = await connect();
    await call('risposte_da_correggere');
    const bad = await call('salva_correzione', { id, correction: correction(9) });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('La correzione non è stata salvata');
    expect(api.saveCorrection).not.toHaveBeenCalled();
    const ok = await call('salva_correzione', { id, correction: correction(2) });
    expect(ok.text).toContain('Correzione salvata');
    expect(api.saveCorrection).toHaveBeenCalledWith(id, correction(2));
  });

  it('il prompt porta le istruzioni', async () => {
    const { client } = await connect();
    const prompt = await client.getPrompt({ name: 'correggi_risposte' });
    expect(JSON.stringify(prompt.messages)).toContain('salva_correzione');
  });

  it('mostra approfondimento e codice dato del colloquio', () => {
    const [item] = stored.submission.items;
    if (!item) throw new Error('fixture');
    const textOf = formatSubmission({
      ...stored,
      kind: 'interview',
      submission: {
        ...stored.submission,
        kind: 'interview',
        items: [{ ...item, code: 'x = 1', followUp: 'Why?', followUpAnswer: null, tests: null }],
      },
    });
    expect(textOf).toContain('Colloquio simulato');
    expect(textOf).toContain('Approfondimento: Why?');
    expect(textOf).toContain('Risposta: (nessuna)');
    expect(textOf).toContain('x = 1');
  });
});
