import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { LessonSourcesResponse } from '@epicfeed/feed';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-client.js';
import type { GenerationApi } from './server.js';
import { createEpicFeedServer } from './server.js';
import { formatLesson } from './feed/tools.js';
import { PROMPT_VERSION } from './feed/prompt.js';
import type { SlidesToolkit } from './feed/slides/toolkit.js';
import { memorySlidesToolkit } from './feed/slides/testing.js';

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

async function connect(
  overrides: Partial<GenerationApi> = {},
  slides: SlidesToolkit = memorySlidesToolkit().kit,
) {
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
    listCatalog: vi.fn(() =>
      Promise.resolve({
        lessons: [
          {
            lessonId,
            lessonTitle: 'Alberi AVL',
            chapterTitle: 'Alberi',
            subjectTitle: 'DSA',
            slides: 0,
          },
        ],
      }),
    ),
    importSlides: vi.fn((id: string) =>
      Promise.resolve({
        lessonId: id,
        presentations: [{ number: 1, lessonPartId: partId, newVersion: true, pages: 2 }],
      }),
    ),
    listExamLessons: vi.fn(() => Promise.reject(new Error('non usato'))),
    readLessonForExam: vi.fn(() => Promise.reject(new Error('non usato'))),
    saveExamPack: vi.fn(() => Promise.reject(new Error('non usato'))),
    listExamSubjects: vi.fn(() => Promise.reject(new Error('non usato'))),
    saveExamBank: vi.fn(() => Promise.reject(new Error('non usato'))),
    listSubmissionsToCorrect: vi.fn(() => Promise.reject(new Error('non usato'))),
    saveCorrection: vi.fn(() => Promise.reject(new Error('non usato'))),
    listPendingReports: vi.fn(() => Promise.reject(new Error('non usato'))),
    completeReport: vi.fn(() => Promise.reject(new Error('non usato'))),
    listStudySubjects: vi.fn(() => Promise.reject(new Error('non usato'))),
    readStudySubject: vi.fn(() => Promise.reject(new Error('non usato'))),
    readProgress: vi.fn(() => Promise.reject(new Error('non usato'))),
    writeProgress: vi.fn(() => Promise.reject(new Error('non usato'))),
    listPendingQuestions: vi.fn(() => Promise.reject(new Error('non usato'))),
    answerQuestion: vi.fn(() => Promise.reject(new Error('non usato'))),
    reportError: vi.fn(() => Promise.reject(new Error('non usato'))),
    ...overrides,
  };
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createEpicFeedServer(api, slides).connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text?: string; data?: string }[];
    return {
      isError: result.isError === true,
      text: content.flatMap((c) => (c.text === undefined ? [] : [c.text])).join('\n'),
      images: content.filter((c) => c.type === 'image').map((c) => c.data),
    };
  };
  return { api, client, call };
}

describe('server MCP di EpicFeed', () => {
  it('espone gli strumenti, i prompt e le istruzioni', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'cerca_lezione',
      'completa_segnalazione',
      'concetti_deboli',
      'domande_in_attesa',
      'importa_slide',
      'leggi_lezione',
      'leggi_lezione_esame',
      'leggi_materiale_esame',
      'lezioni_da_generare',
      'lezioni_per_esame',
      'quiz_al_volo',
      'registra_risposte',
      'rispondi_domanda',
      'risposte_da_correggere',
      'salva_correzione',
      'salva_domande_esame',
      'salva_esercizi_esame',
      'salva_feed_lezione',
      'segnala_errore',
      'segnalazioni_in_attesa',
      'stato_generazione',
    ]);
    expect(client.getInstructions()).toContain('lezioni_da_generare');
    expect(client.getInstructions()).toContain('lezioni_per_esame');
    expect(client.getInstructions()).toContain('risposte_da_correggere');
    expect(client.getInstructions()).toContain('segnalazioni_in_attesa');
    expect(client.getInstructions()).toContain('cerca_lezione');
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

describe('slide', () => {
  const slidesLesson = {
    ...lesson,
    parts: [
      ...lesson.parts,
      {
        lessonPartId: '20000000-0000-4000-8000-000000000004',
        title: 'Slide 1',
        kind: 'slides',
        position: 10_001,
        hasSubtitles: false,
        content: {
          kind: 'slides',
          fileName: 'Alberi AVL-1.pdf',
          pages: [
            { number: 1, text: 'AVL trees' },
            { number: 2, text: '' },
          ],
        },
      },
    ],
  } as unknown as LessonSourcesResponse;

  it('importa_slide abbina lo zip, importa e manda l’avanzamento', async () => {
    const { kit } = memorySlidesToolkit({ 'Alberi AVL-1.pdf': 'AVL trees\n[figura]Rotazione' });
    const { api, client, call } = await connect({}, kit);
    const progress = vi.fn();
    const result = await client.callTool(
      { name: 'importa_slide', arguments: { percorso: ' C:\\slides.zip ' } },
      undefined,
      { onprogress: progress },
    );
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain('Slide importate per 1 lezioni');
    expect(api.importSlides).toHaveBeenCalledWith(lessonId, expect.anything());
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ progress: 1, total: 1 }));
    expect((await call('importa_slide', { percorso: 'C:\\slides.zip' })).text).toContain(
      'Nessuna lezione da aggiornare',
    );
  });

  it('importa_slide spiega gli errori dei file e del token', async () => {
    const { kit } = memorySlidesToolkit();
    kit.listFiles = () => Promise.reject(new Error('Non trovo "x" sul PC.'));
    const missing = await connect({}, kit);
    const result = await missing.call('importa_slide', { percorso: 'x' });
    expect(result).toMatchObject({ isError: true, text: 'Non trovo "x" sul PC.' });
    kit.listFiles = () => Promise.reject(new Error());
    expect((await missing.call('importa_slide', { percorso: 'x' })).text).toBe('');
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- caso di un valore che non è un Error
    kit.listFiles = () => Promise.reject('x');
    expect((await missing.call('importa_slide', { percorso: 'x' })).text).toContain(
      'Errore nella lettura delle slide',
    );

    const { kit: withFiles } = memorySlidesToolkit({ 'Alberi AVL-1.pdf': 'x' });
    const unauthorized = await connect(
      {
        listCatalog: () =>
          Promise.reject(new ApiRequestError(401, 'UNAUTHORIZED', 'Token scaduto.')),
      },
      withFiles,
    );
    expect((await unauthorized.call('importa_slide', { percorso: 'z' })).text).toContain(
      'Crea un nuovo token',
    );
  });

  it('leggi_lezione aggiunge le figure delle slide come immagini', async () => {
    const { kit } = memorySlidesToolkit({ 'Alberi AVL-1.pdf': 'AVL trees\n[figura]' });
    const { call } = await connect({ readLesson: () => Promise.resolve(slidesLesson) }, kit);
    await call('importa_slide', { percorso: 'z' });
    const result = await call('leggi_lezione', { lessonId });
    expect(result.text).toContain('Figura: Slide 1, pagina 2');
    expect(result.images).toEqual([Buffer.from('png-2').toString('base64')]);
    expect(result.text).toContain('### Pagina 2\n(solo figura)');
  });

  it('leggi_lezione avvisa se le slide non sono su questo PC', async () => {
    const { call } = await connect({ readLesson: () => Promise.resolve(slidesLesson) });
    const result = await call('leggi_lezione', { lessonId });
    expect(result.text).toContain('non sono disponibili su questo PC');
    expect(result.images).toEqual([]);
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
