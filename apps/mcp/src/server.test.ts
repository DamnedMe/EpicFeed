import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { LessonSourcesResponse } from '@study-feed/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-client.js';
import type { GenerationApi } from './server.js';
import { createEpicFeedServer, formatLesson } from './server.js';
import { PROMPT_VERSION } from './prompt.js';

const lessonId = '10000000-0000-4000-8000-000000000001';
const partId = '20000000-0000-4000-8000-000000000002';
const hash = 'b'.repeat(64);

const lesson: LessonSourcesResponse = {
  lessonId,
  sourcesHash: hash,
  lessonTitle: 'Alberi AVL',
  chapterTitle: 'Alberi',
  subjectTitle: 'DSA',
  parts: [
    {
      lessonPartId: partId,
      title: 'Rotazioni',
      kind: 'video',
      position: 1,
      hasSubtitles: true,
      content: { kind: 'video', summaries: { it: 'Le rotazioni bilanciano.', en: null } },
    },
    {
      lessonPartId: '20000000-0000-4000-8000-000000000003',
      title: 'Lettura',
      kind: 'reading',
      position: 2,
      hasSubtitles: false,
      content: { kind: 'reading', markdown: 'An AVL tree is balanced.' },
    },
  ],
  glossary: [],
} as unknown as LessonSourcesResponse;

const b = (text: string) => ({ it: text, en: text });

function card(id: string, sourcePartId = partId) {
  return {
    id,
    kind: 'concept',
    title: b(`Titolo ${id}`),
    keyPoint: b('Punto chiave'),
    body: b('Spiegazione breve.'),
    terms: [],
    conceptKeys: ['avl-tree'],
    sourcePartId,
    origin: 'summary',
  };
}

function feed(sourcePartId = partId) {
  return {
    cards: ['a', 'b', 'c'].map((id) => card(id, sourcePartId)),
    quiz: [1, 2].map((n) => ({
      id: `q${String(n)}`,
      kind: 'true_false',
      question: b(`Domanda ${String(n)}?`),
      answer: true,
      explanation: b('Perché sì.'),
      conceptKey: 'avl-tree',
      difficulty: 1,
    })),
    concepts: [{ key: 'avl-tree', name: b('Albero AVL'), description: b('Albero bilanciato.') }],
    glossary: [],
  };
}

async function connect(overrides: Partial<GenerationApi> = {}) {
  const api: GenerationApi = {
    listLessons: vi.fn(() =>
      Promise.resolve({
        lessons: [
          {
            lessonId,
            lessonTitle: 'Alberi AVL',
            chapterTitle: 'Alberi',
            subjectTitle: 'DSA',
            partCount: 2,
          },
        ],
        totals: { lessons: 5, ready: 1, toGenerate: 4 },
      }),
    ),
    readLesson: vi.fn(() => Promise.resolve(lesson)),
    saveFeed: vi.fn(() =>
      Promise.resolve({ feedId: lessonId, created: true, cards: 3, alignedCards: 2 }),
    ),
    ...overrides,
  };
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createEpicFeedServer(api).connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return { isError: result.isError === true, text: content.map((c) => c.text).join('\n') };
  };
  return { api, client, call };
}

describe('server MCP di EpicFeed', () => {
  it('espone i 4 strumenti, il prompt e le istruzioni', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'leggi_lezione',
      'lezioni_da_generare',
      'salva_feed_lezione',
      'stato_generazione',
    ]);
    expect(client.getInstructions()).toContain('lezioni_da_generare');
    const prompt = await client.getPrompt({ name: 'genera_lezioni' });
    const first = prompt.messages[0]?.content as { text: string };
    expect(first.text).toContain(PROMPT_VERSION);
  });

  it('elenca le lezioni da generare e i totali', async () => {
    const { api, call } = await connect();
    const result = await call('lezioni_da_generare', { limite: 1 });
    expect(api.listLessons).toHaveBeenCalledWith(1);
    expect(result.text).toContain('da generare: 4');
    expect(result.text).toContain(`lessonId: ${lessonId}`);
    expect(result.text).toContain('e altre 3');
  });

  it('dice quando non c’è niente da generare', async () => {
    const { call } = await connect({
      listLessons: () =>
        Promise.resolve({ lessons: [], totals: { lessons: 2, ready: 2, toGenerate: 0 } }),
    });
    expect((await call('lezioni_da_generare')).text).toContain('Non ci sono lezioni da generare');
    expect((await call('stato_generazione')).text).toContain('pronte: 2');
  });

  it('legge una lezione con fonti e istruzioni', async () => {
    const { call } = await connect();
    const result = await call('leggi_lezione', { lessonId });
    expect(result.text).toContain(`sourcesHash: ${hash}`);
    expect(result.text).toContain('Come creare il feed');
  });

  it('salva un feed valido con la versione del prompt', async () => {
    const { api, call } = await connect();
    await call('leggi_lezione', { lessonId });
    const result = await call('salva_feed_lezione', { lessonId, sourcesHash: hash, feed: feed() });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('Feed salvato: 3 schede, 2 domande');
    expect(result.text).toContain('2 schede su 3');
    expect(api.saveFeed).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId, sourcesHash: hash, promptVersion: PROMPT_VERSION }),
    );
  });

  it('segnala un feed già esistente', async () => {
    const { call } = await connect({
      saveFeed: () =>
        Promise.resolve({ feedId: lessonId, created: false, cards: 3, alignedCards: 0 }),
    });
    const result = await call('salva_feed_lezione', { lessonId, sourcesHash: hash, feed: feed() });
    expect(result.text).toContain('aveva già un feed');
  });

  it('ferma in locale un feed con parti sconosciute', async () => {
    const { api, call } = await connect();
    await call('leggi_lezione', { lessonId });
    const other = '30000000-0000-4000-8000-000000000009';
    const result = await call('salva_feed_lezione', {
      lessonId,
      sourcesHash: hash,
      feed: feed(other),
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('problemi da correggere');
    expect(api.saveFeed).not.toHaveBeenCalled();
  });

  it('mostra i problemi dell’API e i suggerimenti per token e fonti cambiate', async () => {
    const issues = [{ path: 'cards.0', message: 'Troppo lunga' }];
    const invalid = await connect({
      saveFeed: () => Promise.reject(new ApiRequestError(422, 'INVALID_FEED', 'No', issues)),
    });
    const invalidResult = await invalid.call('salva_feed_lezione', {
      lessonId,
      sourcesHash: hash,
      feed: feed(),
    });
    expect(invalidResult.text).toContain('cards.0: Troppo lunga');

    const conflict = await connect({
      saveFeed: () => Promise.reject(new ApiRequestError(409, 'CONFLICT', 'Fonti cambiate.')),
    });
    const conflictResult = await conflict.call('salva_feed_lezione', {
      lessonId,
      sourcesHash: hash,
      feed: feed(),
    });
    expect(conflictResult.text).toContain('Chiama di nuovo leggi_lezione');

    const unauthorized = await connect({
      readLesson: () => Promise.reject(new ApiRequestError(401, 'UNAUTHORIZED', 'Token scaduto.')),
    });
    const unauthorizedResult = await unauthorized.call('leggi_lezione', { lessonId });
    expect(unauthorizedResult.isError).toBe(true);
    expect(unauthorizedResult.text).toContain('Crea un nuovo token');

    const notFound = await connect({
      readLesson: () => Promise.reject(new ApiRequestError(404, 'NOT_FOUND', 'Non trovata.')),
    });
    expect((await notFound.call('leggi_lezione', { lessonId })).text).toBe('Non trovata.');
  });

  it('non mostra dettagli di errori inattesi', async () => {
    const { call } = await connect({ listLessons: () => Promise.reject(new Error('segreto')) });
    const result = await call('stato_generazione');
    expect(result.isError).toBe(true);
    expect(result.text).not.toContain('segreto');
  });
});

describe('formatLesson', () => {
  it('include id, riassunti, letture e glossario', () => {
    const textValue = formatLesson(lesson);
    expect(textValue).toContain(`sourcePartId: ${partId}`);
    expect(textValue).toContain('con sottotitoli');
    expect(textValue).toContain('(missing)');
    expect(textValue).toContain('An AVL tree is balanced.');
    expect(textValue).toContain('(ancora vuoto)');
    const withGlossary = formatLesson({
      ...lesson,
      glossary: [{ term: 'AVL tree', translation: 'albero AVL', definition: b('x') }],
    });
    expect(withGlossary).toContain('- AVL tree — albero AVL');
  });
});
