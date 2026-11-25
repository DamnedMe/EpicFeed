import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { StoredCorrection } from '@epicfeed/feed';
import { ApiRequestError } from '../api-client.js';
import { REPORT_PROMPT_VERSION } from './report-prompt.js';
import type { ReportApi } from './report-tools.js';
import { formatReport, MAX_REPORTS_PER_CALL, registerReportTools } from './report-tools.js';

const id = '60000000-0000-4000-8000-000000000001';
const lessonId = '10000000-0000-4000-8000-000000000001';

const report: StoredCorrection = {
  id,
  subjectId: '40000000-0000-4000-8000-000000000001',
  correction: {
    kind: 'text',
    lessonId,
    itemType: 'card',
    itemId: 'stack-rule',
    edits: [
      {
        field: 'keyPoint',
        language: 'it',
        original: 'La pila segue la regola FIFO.',
        corrected: 'La pila segue la regola LIFO.',
      },
    ],
    reason: 'content',
    snapshot: {
      keyPoint: { it: 'La pila segue la regola FIFO.', en: 'A stack follows the FIFO rule.' },
    },
  },
  claudeStatus: 'pending',
  completion: null,
  createdAt: '2026-11-25T10:00:00.000Z',
};

const done = (language: 'it' | 'en') => ({
  outcome: 'done',
  edits: [
    {
      field: 'keyPoint',
      language,
      original: 'A stack follows the FIFO rule.',
      corrected: 'A stack follows the LIFO rule.',
    },
  ],
});

async function connect(reports: StoredCorrection[] = [report], api?: Partial<ReportApi>) {
  const full: ReportApi = {
    listPendingReports: vi.fn(() => Promise.resolve({ corrections: reports })),
    completeReport: vi.fn(() => Promise.resolve()),
    ...api,
  };
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  registerReportTools(server, full);
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
  return { api: full, call, client };
}

describe('segnalazioni per Claude Desktop', () => {
  it("mostra la correzione, l'elemento e le istruzioni", async () => {
    const { call } = await connect();
    const listed = await call('segnalazioni_in_attesa');
    expect(listed.text).toContain(`id: ${id}`);
    expect(listed.text).toContain(`lessonId: ${lessonId}`);
    expect(listed.text).toContain(
      '«La pila segue la regola FIFO.» → «La pila segue la regola LIFO.»',
    );
    expect(listed.text).toContain('A stack follows the FIFO rule.');
    expect(listed.text).toContain(REPORT_PROMPT_VERSION);
  });

  it('senza segnalazioni lo dice, con troppe ne mostra un gruppo', async () => {
    expect((await (await connect([])).call('segnalazioni_in_attesa')).text).toContain(
      'Non ci sono segnalazioni',
    );
    const many = Array.from({ length: MAX_REPORTS_PER_CALL + 2 }, (_, i) => ({
      ...report,
      id: `60000000-0000-4000-8000-00000000000${String(i)}`,
    }));
    const listed = await (await connect(many)).call('segnalazioni_in_attesa');
    expect(listed.text).toContain('… e altre 2 segnalazioni');
  });

  it("ferma in locale un esito senza l'altra lingua, poi salva", async () => {
    const { api, call } = await connect();
    await call('segnalazioni_in_attesa');
    const bad = await call('completa_segnalazione', { id, completion: done('it') });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('La segnalazione non è stata salvata');
    expect(bad.text).toContain('Manca la correzione in inglese');
    expect(api.completeReport).not.toHaveBeenCalled();
    const ok = await call('completa_segnalazione', {
      id: id.toUpperCase(),
      completion: done('en'),
    });
    expect(ok.text).toContain('Segnalazione completata');
    expect(api.completeReport).toHaveBeenCalledWith(id, done('en'));
  });

  it('salva una nota da ricontrollare', async () => {
    const { api, call } = await connect();
    const completion = { outcome: 'disputed', note: 'Il riassunto dice FIFO.', evidence: 'FIFO' };
    const saved = await call('completa_segnalazione', { id, completion });
    expect(saved.text).toContain('da ricontrollare');
    expect(api.completeReport).toHaveBeenCalledWith(id, completion);
  });

  it('una segnalazione già completata rimanda alla successiva', async () => {
    const { call } = await connect([report], {
      completeReport: vi.fn(() =>
        Promise.reject(new ApiRequestError(409, 'CONFLICT', 'La correzione è già completata.')),
      ),
    });
    const result = await call('completa_segnalazione', { id, completion: done('en') });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('segnalazioni_in_attesa');
  });

  it('il prompt porta le istruzioni', async () => {
    const { client } = await connect();
    const prompt = await client.getPrompt({ name: 'sistema_segnalazioni' });
    expect(JSON.stringify(prompt.messages)).toContain('completa_segnalazione');
  });

  it('descrive le schede da rifare e salta il resto', () => {
    const regenerate = formatReport({
      ...report,
      correction: {
        kind: 'regenerate',
        lessonId,
        itemType: 'quiz',
        itemId: 'q1',
        reason: 'unclear',
        snapshot: { question: { it: 'Domanda?', en: 'Question?' } },
      },
    });
    expect(regenerate).toContain('Da rifare dai riassunti');
    expect(regenerate).toContain('domanda q1 · motivo: poco chiaro');
    expect(
      formatReport({
        ...report,
        claudeStatus: 'not_needed',
        correction: { kind: 'term', from: 'Big 0', to: 'Big O', reason: 'content' },
      }),
    ).toContain('salta');
  });
});
