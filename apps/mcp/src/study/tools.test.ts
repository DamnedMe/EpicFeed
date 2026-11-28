import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProgressSnapshot } from '@epicfeed/review';
import { derivePasswordKey, encryptSnapshot } from '@epicfeed/review/crypto';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api-client.js';
import { memorySlidesToolkit } from '../feed/slides/testing.js';
import type { GenerationApi } from '../server.js';
import { createEpicFeedServer } from '../server.js';
import type { ProgressCredentials } from './progress.js';
import { HEAP_LESSON, SUBJECT_ID, dsaFeed } from './testing.js';

const unused = () => vi.fn(() => Promise.reject(new Error('non usato')));
const credentials: ProgressCredentials = {
  email: 'anna@example.com',
  password: 'una password lunga',
};

const snapshot: ProgressSnapshot = {
  version: 1,
  answers: [
    {
      conceptId: `${SUBJECT_ID}:avl-rotation`,
      questionId: null,
      source: 'feed',
      grade: 'again',
      language: 'it',
      at: '2026-11-27T10:00:00.000Z',
    },
  ],
  reviewDays: [],
  bestStreak: 0,
};

async function connect(
  overrides: Partial<GenerationApi> = {},
  creds: ProgressCredentials | null = null,
) {
  const api = {
    listLessons: unused(),
    readLesson: unused(),
    saveFeed: unused(),
    listCatalog: unused(),
    importSlides: unused(),
    listExamLessons: unused(),
    readLessonForExam: unused(),
    saveExamPack: unused(),
    listExamSubjects: unused(),
    saveExamBank: unused(),
    listSubmissionsToCorrect: unused(),
    saveCorrection: unused(),
    listPendingReports: unused(),
    completeReport: unused(),
    listStudySubjects: vi.fn(() =>
      Promise.resolve({
        subjects: [
          {
            subjectId: SUBJECT_ID,
            title: 'Data Structures',
            editionLabel: '2026',
            lessons: 3,
            lessonsWithFeed: 2,
          },
        ],
      }),
    ),
    readStudySubject: vi.fn(() => Promise.resolve(dsaFeed())),
    readProgress: vi.fn(async () => ({
      ...(await encryptSnapshot(
        await derivePasswordKey(credentials.email, credentials.password),
        snapshot,
      )),
      revision: 1,
    })),
    reportError: vi.fn((body: Parameters<GenerationApi['reportError']>[0]) =>
      Promise.resolve({
        id: body.id,
        subjectId: body.subjectId,
        correction: body.correction,
        claudeStatus: 'not_needed' as const,
        completion: null,
        createdAt: '2026-11-28T10:00:00.000Z',
      }),
    ),
    ...overrides,
  } satisfies GenerationApi;
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createEpicFeedServer(api, memorySlidesToolkit().kit, creds).connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { text?: string }[];
    return { isError: result.isError === true, text: content.map((c) => c.text ?? '').join('\n') };
  };
  return { api, client, call };
}

const heapFix = {
  subjectId: SUBJECT_ID,
  kind: 'text',
  lessonId: HEAP_LESSON,
  itemType: 'card',
  itemId: 'heap-sift',
  edits: [
    { field: 'keyPoint', language: 'it', original: 'O(n)', corrected: 'O(log n)' },
    { field: 'keyPoint', language: 'en', original: 'O(n)', corrected: 'O(log n)' },
  ],
  reason: 'content',
};

describe('strumenti dell’assistente di studio', () => {
  it('cerca una lezione e risponde con scheda, minuto e id', async () => {
    const { call } = await connect();
    const result = await call('cerca_lezione', { testo: 'rotazioni AVL', materia: 'data' });
    expect(result.text).toContain('Binary trees & AVL trees · Scheda 1');
    expect(result.text).toContain('dal minuto 2:05');
    expect(result.text).toContain('itemId avl-rotation');
    const none = await call('cerca_lezione', { testo: 'grafo diretto' });
    expect(none.text).toContain('Nessuna scheda');
    const other = await call('cerca_lezione', { testo: 'avl', materia: 'python' });
    expect(other.text).toContain('Nessuna materia');
  });

  it('elenca i concetti deboli decifrando i progressi sul PC', async () => {
    const { call } = await connect({}, credentials);
    const result = await call('concetti_deboli', {});
    expect(result.text).toContain('Rotazioni AVL (AVL rotations)');
    expect(result.text).toContain('errori 1 su 1');
  });

  it('senza credenziali spiega come impostarle', async () => {
    const { call, api } = await connect();
    const result = await call('concetti_deboli', {});
    expect(result.text).toContain('Configura');
    expect(api.readProgress).not.toHaveBeenCalled();
  });

  it('mostra l’anteprima e salva solo con la conferma', async () => {
    const { call, api } = await connect();
    const preview = await call('segnala_errore', { ...heapFix, confirmed: false });
    expect(preview.text).toContain('NON ancora salvata');
    expect(preview.text).toContain('«O(n)» → «O(log n)»');
    expect(api.reportError).not.toHaveBeenCalled();

    const saved = await call('segnala_errore', { ...heapFix, confirmed: true });
    expect(saved.text).toContain('Correzione salvata');
    expect(api.reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: SUBJECT_ID,
        correction: expect.objectContaining({ kind: 'text' }) as unknown,
      }),
    );
    // Dopo il salvataggio la materia si riscarica, con la correzione.
    await call('cerca_lezione', { testo: 'sift' });
    expect(api.readStudySubject).toHaveBeenCalledTimes(2);
  });

  it('chiede l’altra lingua, i campi mancanti e rifiuta una frase che non c’è', async () => {
    const { call } = await connect();
    const single = await call('segnala_errore', {
      ...heapFix,
      edits: heapFix.edits.slice(0, 1),
      confirmed: false,
    });
    expect(single.text).toContain('Manca l’altra lingua');
    const noEdits = await call('segnala_errore', {
      ...heapFix,
      edits: undefined,
      confirmed: false,
    });
    expect(noEdits.isError).toBe(true);
    expect(noEdits.text).toContain('edits');
    const wrong = await call('segnala_errore', {
      ...heapFix,
      edits: [{ field: 'keyPoint', language: 'it', original: 'O(n²)', corrected: 'O(log n)' }],
      confirmed: false,
    });
    expect(wrong.isError).toBe(true);
    expect(wrong.text).toContain('original');
  });

  it('prepara anche risposte e termini', async () => {
    const { call } = await connect();
    const answer = await call('segnala_errore', {
      subjectId: SUBJECT_ID,
      kind: 'answer',
      lessonId: '10000000-0000-4000-8000-000000000001',
      itemId: 'avl-case',
      correct: { index: 2 },
      reason: 'content',
      confirmed: false,
    });
    expect(answer.text).toContain('«Destra-sinistra» / «Right-left»');
    const term = await call('segnala_errore', {
      subjectId: SUBJECT_ID,
      kind: 'term',
      from: 'Big 0',
      to: 'Big O',
      reason: 'content',
      confirmed: false,
    });
    expect(term.text).toContain('in 1 schede e domande di 1 lezioni: Heaps');
    const missing = await call('segnala_errore', {
      subjectId: SUBJECT_ID,
      kind: 'term',
      reason: 'content',
      confirmed: false,
    });
    expect(missing.isError).toBe(true);
  });

  it('riporta gli errori dell’API in parole', async () => {
    const { call } = await connect({
      listStudySubjects: vi.fn(() =>
        Promise.reject(new ApiRequestError(401, 'UNAUTHORIZED', 'Token scaduto.')),
      ),
    });
    const result = await call('cerca_lezione', { testo: 'avl' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Token scaduto.');
  });

  it('offre il prompt per studiare', async () => {
    const { client } = await connect();
    const prompt = await client.getPrompt({ name: 'studia_con_epicfeed' });
    expect((prompt.messages[0]?.content as { text: string }).text).toContain('concetti_deboli');
  });
});
