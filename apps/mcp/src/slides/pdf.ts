/**
 * Lettura delle slide in PDF sul PC (ADR 0012, ADR 0013): testo di ogni
 * pagina, riconoscimento delle pagine con figure e disegno in PNG con
 * pdf.js e @napi-rs/canvas. Nulla esce dal PC tranne il testo (all'API) e le
 * immagini (a Claude Desktop, durante la generazione).
 */

import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import type * as PdfJsModule from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Pagina letta da un PDF. */
export interface PdfPage {
  readonly number: number;
  readonly text: string;
  /**
   * Quanto la pagina sembra contenere una figura: tracciati vettoriali e
   * immagini oltre a quelli del modello comune a tutte le pagine.
   */
  readonly figureScore: number;
}

/** Pagine con un punteggio almeno pari a questo passano come immagine. */
export const FIGURE_THRESHOLD = 6;

/** Massimo di immagini di slide per lezione (ADR 0013). */
export const MAX_IMAGES_PER_LESSON = 8;

/** Larghezza delle immagini delle slide, in pixel (ADR 0013). */
export const IMAGE_WIDTH = 1280;

type PdfJs = typeof PdfJsModule;
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
let pdfjs: Promise<PdfJs> | undefined;

/** Carica pdf.js una volta sola, solo quando servono le slide. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= importPdfJsAsNode().catch((error: unknown) => {
    // Un caricamento fallito non resta in memoria: la chiamata dopo riprova.
    pdfjs = undefined;
    throw error;
  });
  return pdfjs;
}

/**
 * Importa pdf.js facendogli riconoscere Node anche dentro Claude Desktop.
 *
 * Claude Desktop avvia il server in un processo figlio di Electron
 * (`process.type` diverso da `'browser'`): pdf.js lo scambia per una pagina
 * web e cerca `document`, un worker web e i font del browser. pdf.js decide
 * una volta sola, al caricamento del modulo, quindi basta presentargli un
 * processo "principale" durante l'import (vedi {@link presentAsMainProcess}).
 * Il worker si carica in anticipo nello stesso processo (`globalThis.pdfjsWorker`),
 * così pdf.js non ha bisogno di `GlobalWorkerOptions.workerSrc`.
 */
async function importPdfJsAsNode(): Promise<PdfJs> {
  const restore = presentAsMainProcess();
  try {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= worker;
    return await import('pdfjs-dist/legacy/build/pdf.mjs');
  } finally {
    restore();
  }
}

/**
 * In un processo figlio di Electron sostituisce per poco `globalThis.process`
 * con una vista che risponde `type: 'browser'` e inoltra tutto il resto al
 * processo vero. `process.type` in Electron è di sola lettura, quindi non si
 * può cambiare direttamente. La vista ha un bersaglio vuoto, così le regole
 * dei Proxy sulle proprietà non modificabili non scattano, e le funzioni
 * restano legate al processo vero.
 *
 * @returns La funzione che rimette il `process` originale.
 */
function presentAsMainProcess(): () => void {
  const real = process as NodeJS.Process & { type?: unknown };
  const electronChild =
    typeof real.versions.electron === 'string' &&
    typeof real.type === 'string' &&
    real.type !== 'browser';
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
  if (!electronChild || !descriptor?.configurable) return () => undefined;

  const view = new Proxy({} as NodeJS.Process, {
    get(_target, key) {
      if (key === 'type') return 'browser';
      const value: unknown = Reflect.get(real, key, real);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(real)
        : value;
    },
    has: (_target, key) => Reflect.has(real, key),
    set: (_target, key, value) => Reflect.set(real, key, value, real),
  });
  Object.defineProperty(globalThis, 'process', {
    value: view,
    writable: true,
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
  });
  return () => {
    Object.defineProperty(globalThis, 'process', descriptor);
  };
}

/** Percorso (con separatore finale, come vuole pdf.js) di una cartella di pdf.js. */
function pdfJsAssets(): (folder: string) => string {
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  return (folder) => join(root, folder) + sep;
}

/**
 * Apre un PDF ed esegue il lavoro, poi libera sempre le risorse di pdf.js.
 */
async function withDocument<T>(
  data: Uint8Array,
  work: (doc: PdfDocument) => Promise<T>,
): Promise<T> {
  const { getDocument } = await loadPdfJs();
  const assets = pdfJsAssets();
  const task = getDocument({
    // Copia: pdf.js trasferisce il buffer al suo worker e lo rende inutilizzabile.
    data: data.slice(),
    verbosity: 0,
    // In Node non ci sono font del browser: i glifi si disegnano come tracciati.
    disableFontFace: true,
    // Risorse di pdf.js lette dal disco (font standard, mappe dei caratteri,
    // decodificatori WebAssembly per alcune immagini), incluse nel pacchetto.
    standardFontDataUrl: assets('standard_fonts'),
    cMapUrl: assets('cmaps'),
    wasmUrl: assets('wasm'),
    iccUrl: assets('iccs'),
  });
  try {
    return await work(await task.promise);
  } finally {
    await task.destroy();
  }
}

/**
 * Legge testo e punteggio di figura di ogni pagina.
 *
 * Il punteggio toglie il "modello" della presentazione: i tracciati presenti
 * in ogni pagina (sfondi, barre, loghi) e le immagini che compaiono con le
 * stesse dimensioni in più di metà delle pagine.
 *
 * @param data - Contenuto del PDF.
 * @returns Le pagine, in ordine.
 */
export async function readPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  const { OPS } = await loadPdfJs();
  return withDocument(data, async (doc) => {
    const raw: { number: number; text: string; paths: number; images: string[] }[] = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .trim();
      const ops = await page.getOperatorList();
      let paths = 0;
      const images: string[] = [];
      ops.fnArray.forEach((fn, index) => {
        if (fn === OPS.constructPath) paths += 1;
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          const args = ops.argsArray[index] as unknown[] | undefined;
          images.push(`${String(args?.[1])}x${String(args?.[2])}`);
        }
      });
      raw.push({ number, text, paths, images });
      page.cleanup();
    }

    const basePaths = Math.min(...raw.map((page) => page.paths));
    const imageCounts = new Map<string, number>();
    for (const page of raw) {
      for (const size of new Set(page.images))
        imageCounts.set(size, (imageCounts.get(size) ?? 0) + 1);
    }
    const isTemplate = (size: string) =>
      raw.length > 2 && (imageCounts.get(size) ?? 0) > raw.length / 2;

    return raw.map((page) => ({
      number: page.number,
      text: page.text,
      figureScore:
        page.paths -
        basePaths +
        page.images.filter((size) => !isTemplate(size)).length * FIGURE_THRESHOLD,
    }));
  });
}

/**
 * Sceglie le pagine da mostrare a Claude come immagine: quelle con figure, le
 * più ricche prima, entro il tetto per lezione; poi in ordine di pagina.
 *
 * @param decks - Pagine di ogni presentazione della lezione.
 * @param max - Tetto di immagini.
 * @returns Coppie presentazione/pagina, in ordine di lettura.
 */
export function pickFigurePages(
  decks: readonly { readonly number: number; readonly pages: readonly PdfPage[] }[],
  max = MAX_IMAGES_PER_LESSON,
): { deck: number; page: number }[] {
  return decks
    .flatMap((deck) =>
      deck.pages
        .filter((page) => page.figureScore >= FIGURE_THRESHOLD)
        .map((page) => ({ deck: deck.number, page: page.number, score: page.figureScore })),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.deck - b.deck || a.page - b.page)
    .map(({ deck, page }) => ({ deck, page }));
}

/**
 * Disegna alcune pagine del PDF in PNG, larghe {@link IMAGE_WIDTH} pixel.
 *
 * @param data - Contenuto del PDF.
 * @param pages - Numeri delle pagine da disegnare.
 * @returns Le immagini PNG, nello stesso ordine.
 */
export async function renderPdfPages(
  data: Uint8Array,
  pages: readonly number[],
): Promise<{ page: number; png: Buffer }[]> {
  const { createCanvas } = await import('@napi-rs/canvas');
  return withDocument(data, async (doc) => {
    const images: { page: number; png: Buffer }[] = [];
    for (const number of pages) {
      if (number < 1 || number > doc.numPages) continue;
      const page = await doc.getPage(number);
      const scale = IMAGE_WIDTH / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const context = canvas.getContext('2d');
      // Sfondo bianco: le slide esportate a volte non ne disegnano uno.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      // Il canvas di @napi-rs/canvas ha la stessa interfaccia di quello del browser.
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push({ page: number, png: canvas.toBuffer('image/png') });
      page.cleanup();
    }
    return images;
  });
}
