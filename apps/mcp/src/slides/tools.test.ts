import type { LessonSourcesResponse } from '@epicfeed/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api-client.js';
import { memorySlidesToolkit } from './testing.js';
import type { SlidesApi } from './tools.js';
import {
  IMPORT_TIME_BUDGET_MS,
  RESUME_WINDOW_MS,
  importSlides,
  newImportSession,
  slideImagesFor,
} from './tools.js';

const catalog = [
  {
    lessonId: 'l1',
    lessonTitle: 'AVL trees',
    chapterTitle: 'Trees',
    subjectTitle: 'DSA',
    slides: 0,
  },
  { lessonId: 'l2', lessonTitle: 'Heaps', chapterTitle: 'Trees', subjectTitle: 'DSA', slides: 1 },
];

function api(overrides: Partial<SlidesApi> = {}) {
  const importMock = vi.fn((lessonId: string, body: Parameters<SlidesApi['importSlides']>[1]) =>
    Promise.resolve({
      lessonId,
      presentations: body.presentations.map((p) => ({
        number: p.number,
        lessonPartId: '20000000-0000-4000-8000-000000000001',
        newVersion: true,
        pages: p.pages.length,
      })),
    }),
  );
  const value: SlidesApi = {
    listCatalog: () => Promise.resolve({ lessons: catalog }),
    importSlides: importMock,
    ...overrides,
  };
  return { value, importMock };
}

const pdfs = {
  'AVL trees-1.pdf': 'AVL trees\n[figura]Rotation',
  'AVL trees-2.pdf': 'Balance factor',
  'Heaps-1.pdf': 'Heaps',
  'Graphs-1.pdf': 'Graphs',
};

describe('importSlides', () => {
  it("separa il materiale d'esame dalle slide delle lezioni", async () => {
    const { kit } = memorySlidesToolkit({ ...pdfs, 'Exam Prep-1.pdf': 'Exercise 1' });
    const outcome = await importSlides(api().value, kit, newImportSession(), {
      path: 'C:\\slides.zip',
    });
    expect(outcome.text).toContain("Materiale d'esame trovato (Exam Prep-1.pdf)");
    expect(outcome.text).toContain('leggi_materiale_esame');
    expect(outcome.text).not.toContain('Exam Prep-1.pdf: nessuna lezione');
  });

  it('importa le lezioni nuove, salta quelle che hanno già le slide e elenca gli esclusi', async () => {
    const { kit, stored } = memorySlidesToolkit(pdfs);
    const { value, importMock } = api();
    const progress = vi.fn(() => Promise.resolve());
    const outcome = await importSlides(value, kit, newImportSession(), {
      path: 'C:\\slides.zip',
      onProgress: progress,
    });
    expect(outcome.isError).toBe(false);
    expect(outcome.text).toContain(
      'Slide importate per 1 lezioni: 2 presentazioni, di cui 2 nuove',
    );
    expect(outcome.text).toContain('tornano tra quelle da generare');
    expect(outcome.text).toContain('Graphs-1.pdf: nessuna lezione importata');
    expect(importMock).toHaveBeenCalledTimes(1);
    expect(importMock.mock.calls[0]?.[1].presentations[0]).toEqual({
      number: 1,
      fileName: 'AVL trees-1.pdf',
      pages: [
        { number: 1, text: 'AVL trees' },
        { number: 2, text: 'Rotation' },
      ],
    });
    expect(stored.get('l1')).toEqual([
      { number: 1, source: 'C:\\slides.zip', entry: 'Course downloads/AVL trees-1.pdf' },
      { number: 2, source: 'C:\\slides.zip', entry: 'Course downloads/AVL trees-2.pdf' },
    ]);
    expect(progress).toHaveBeenCalledWith(1, 1);
  });

  it('con aggiorna rilegge tutto; una seconda chiamata subito dopo non ripete', async () => {
    const { kit } = memorySlidesToolkit(pdfs);
    const session = newImportSession();
    const { value, importMock } = api();
    await importSlides(value, kit, session, { path: 'z', refresh: true });
    expect(importMock).toHaveBeenCalledTimes(2);
    const again = await importSlides(value, kit, session, { path: 'z', refresh: true });
    expect(again.text).toContain('importate negli ultimi minuti');
    expect(importMock).toHaveBeenCalledTimes(2);
    // Più tardi, aggiorna rilegge di nuovo.
    kit.tick(RESUME_WINDOW_MS + 1);
    await importSlides(value, kit, session, { path: 'z', refresh: true });
    expect(importMock).toHaveBeenCalledTimes(4);
  });

  it('una lezione fallita non conta come fatta: si riprova, dopo le altre', async () => {
    const { kit } = memorySlidesToolkit(pdfs);
    const session = newImportSession();
    const order: string[] = [];
    let failAvl = true;
    const { value } = api({
      importSlides: (lessonId, body) => {
        order.push(lessonId);
        if (lessonId === 'l1' && failAvl) return Promise.reject(new Error('lettura fallita'));
        return Promise.resolve({
          lessonId,
          presentations: body.presentations.map((p) => ({
            number: p.number,
            lessonPartId: '20000000-0000-4000-8000-000000000001',
            newVersion: true,
            pages: p.pages.length,
          })),
        });
      },
    });
    const first = await importSlides(value, kit, session, { path: 'z', refresh: true });
    expect(first.text).toContain('AVL trees: lettura fallita');
    expect(first.text).not.toContain('Restano');
    failAvl = false;
    order.length = 0;
    const retry = await importSlides(value, kit, session, { path: 'z' });
    expect(order).toEqual(['l1']);
    expect(retry.text).toContain('Slide importate per 1 lezioni');

    // Con più lezioni da fare, quella già fallita passa in fondo.
    const other = newImportSession();
    other.failed.add('z|l1');
    order.length = 0;
    await importSlides(value, kit, other, { path: 'z', refresh: true });
    expect(order).toEqual(['l2', 'l1']);
  });

  it('si ferma dopo il tempo massimo e dice di continuare', async () => {
    const { kit } = memorySlidesToolkit(pdfs);
    const { value } = api({
      importSlides: (lessonId) => {
        kit.tick(IMPORT_TIME_BUDGET_MS + 1);
        return Promise.resolve({ lessonId, presentations: [] });
      },
    });
    const outcome = await importSlides(value, kit, newImportSession(), {
      path: 'z',
      refresh: true,
    });
    expect(outcome.text).toContain('Restano 1 lezioni');
  });

  it('riporta gli errori per lezione, ma si ferma su un token non valido', async () => {
    const { kit } = memorySlidesToolkit(pdfs);
    const failing = api({
      importSlides: () => Promise.reject(new ApiRequestError(404, 'NOT_FOUND', 'Lezione sparita.')),
    });
    const outcome = await importSlides(failing.value, kit, newImportSession(), { path: 'z' });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('AVL trees: Lezione sparita.');

    const odd = api({ importSlides: () => Promise.reject(new Error('boom')) });
    const oddOutcome = await importSlides(odd.value, kit, newImportSession(), { path: 'z' });
    expect(oddOutcome.text).toContain('AVL trees: boom');
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- caso di un valore che non è un Error
    const strange = api({ importSlides: () => Promise.reject('x') });
    expect(
      (await importSlides(strange.value, kit, newImportSession(), { path: 'z' })).text,
    ).toContain('errore inatteso');

    const unauthorized = api({
      importSlides: () => Promise.reject(new ApiRequestError(401, 'UNAUTHORIZED', 'Token.')),
    });
    await expect(
      importSlides(unauthorized.value, kit, newImportSession(), { path: 'z' }),
    ).rejects.toThrow('Token.');
  });

  it('dice quando non ci sono PDF e tronca un elenco lungo di esclusi', async () => {
    const empty = memorySlidesToolkit({});
    expect(
      (await importSlides(api().value, empty.kit, newImportSession(), { path: 'vuota' })).text,
    ).toContain('non ci sono PDF');
    const many = Object.fromEntries(
      Array.from({ length: 35 }, (_, i) => [`Other ${String(i)}-1.pdf`, 'x']),
    );
    const { kit } = memorySlidesToolkit(many);
    const outcome = await importSlides(api().value, kit, newImportSession(), { path: 'z' });
    expect(outcome.text).toContain('… e altri 5.');
  });
});

const lesson = (fileNames: string[]): LessonSourcesResponse =>
  ({
    lessonId: 'l1',
    parts: fileNames.map((fileName) => ({
      content: { kind: 'slides', fileName, pages: [{ number: 1, text: '' }] },
    })),
  }) as unknown as LessonSourcesResponse;

describe('slideImagesFor', () => {
  it('disegna solo le pagine con figure delle presentazioni della lezione', async () => {
    const { kit } = memorySlidesToolkit(pdfs);
    await importSlides(api().value, kit, newImportSession(), { path: 'z' });
    const { images, note } = await slideImagesFor(
      lesson(['AVL trees-1.pdf', 'AVL trees-2.pdf']),
      kit,
    );
    expect(note).toBeNull();
    expect(images.map((image) => image.label)).toEqual(['Slide 1, pagina 2']);
    expect(images[0]?.png.toString()).toBe('png-2');
  });

  it('senza slide non fa nulla; senza PDF sul PC lo dice', async () => {
    const { kit } = memorySlidesToolkit(pdfs);
    expect(await slideImagesFor(lesson([]), kit)).toEqual({ images: [], note: null });
    expect((await slideImagesFor(lesson(['AVL trees-1.pdf']), kit)).note).toContain(
      'non sono disponibili',
    );
    await kit.index.setMany(
      new Map([['l1', [{ number: 1, source: 'z', entry: 'x/Sparito-1.pdf' }]]]),
    );
    expect((await slideImagesFor(lesson(['Sparito-1.pdf']), kit)).note).toContain(
      'Non riesco a leggere',
    );
  });
});
