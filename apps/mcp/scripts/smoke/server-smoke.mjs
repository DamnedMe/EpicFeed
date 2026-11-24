// Prova del pacchetto dentro un "utility process" di Electron, come in Claude
// Desktop. `build.mjs` unisce questo file in `server-smoke.mjs`, da copiare
// accanto a `server/index.js` del pacchetto estratto: così usa gli stessi
// pdf.js e @napi-rs/canvas di `server/node_modules`.
//
// Uso: server-smoke.mjs <zip delle slide> <file del risultato JSON>
// Importa le slide dello zip di prova con l'API finta, poi chiede le figure
// di una lezione come fa `leggi_lezione`. Esce con 0 solo se tutto va.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSlidesToolkit } from '../../src/feed/slides/toolkit.js';
import { importSlides, newImportSession, slideImagesFor } from '../../src/feed/slides/tools.js';

const [zipPath, resultPath] = process.argv.slice(-2);
const lessonId = '10000000-0000-4000-8000-000000000001';
const result = {
  platform: process.platform,
  electron: process.versions.electron ?? null,
  processType: process.type ?? null,
  node: process.versions.node,
  checks: {},
  ok: false,
};

try {
  /** @type {{ number: number; fileName: string; pages: { number: number; text: string }[] }[]} */
  let posted = [];
  const api = {
    listCatalog: () =>
      Promise.resolve({
        lessons: [
          {
            lessonId,
            lessonTitle: 'AVL trees',
            chapterTitle: 'Trees',
            subjectTitle: 'DSA',
            slides: 0,
          },
        ],
      }),
    importSlides: (id, body) => {
      posted = body.presentations;
      return Promise.resolve({
        lessonId: id,
        presentations: body.presentations.map((p) => ({
          number: p.number,
          lessonPartId: lessonId,
          newVersion: true,
          pages: p.pages.length,
        })),
      });
    },
  };
  // Cartella dati con uno spazio nel nome, come "C:\Users\Nome Cognome".
  const kit = defaultSlidesToolkit(join(mkdtempSync(join(tmpdir(), 'Epic Feed ')), 'dati'));
  const outcome = await importSlides(api, kit, newImportSession(), { path: zipPath });
  result.checks.importText = outcome.text;
  result.checks.importOk = !outcome.isError && posted.length === 2;
  result.checks.pages = posted.map((p) => `${p.fileName}: ${String(p.pages.length)} pagine`);
  result.checks.textOk = posted.some((p) =>
    p.pages.some((page) => page.text.includes('self-balancing binary search tree')),
  );

  const lesson = {
    lessonId,
    sourcesHash: 'a'.repeat(64),
    lessonTitle: 'AVL trees',
    chapterTitle: 'Trees',
    subjectTitle: 'DSA',
    glossary: [],
    parts: posted.map((p) => ({
      lessonPartId: lessonId,
      title: `Slide ${String(p.number)}`,
      kind: 'slides',
      position: 10000 + p.number,
      hasSubtitles: false,
      content: { kind: 'slides', fileName: p.fileName, pages: p.pages },
    })),
  };
  const figures = await slideImagesFor(lesson, kit);
  result.checks.figures = figures.images.map((i) => `${i.label}: ${String(i.png.length)} byte`);
  result.checks.figureNote = figures.note;
  result.checks.figuresOk =
    figures.note === null &&
    figures.images.length > 0 &&
    figures.images.every((i) => i.png.subarray(1, 4).toString() === 'PNG');
  result.checks.processRestored = globalThis.process === process;
  result.ok =
    result.checks.importOk &&
    result.checks.textOk &&
    result.checks.figuresOk &&
    result.checks.processRestored;
} catch (error) {
  result.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
}
writeFileSync(resultPath, JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
