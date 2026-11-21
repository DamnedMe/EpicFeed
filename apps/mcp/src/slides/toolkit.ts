import { readFile, stat } from 'node:fs/promises';
import type { SlideFile } from './archive.js';
import { MAX_PDF_BYTES, listSlideFiles, readZipEntry } from './archive.js';
import type { PdfPage } from './pdf.js';
import { readPdfPages, renderPdfPages } from './pdf.js';
import type { StoredDeck } from './store.js';
import { SlidesIndex, defaultDataDir } from './store.js';

/**
 * Operazioni sui file delle slide usate dagli strumenti MCP, raccolte in un
 * oggetto così i test le sostituiscono senza PDF né disco.
 */
export interface SlidesToolkit {
  /** PDF di uno zip o di una cartella. */
  listFiles(path: string): Promise<SlideFile[]>;
  /** Testo e punteggio di figura di ogni pagina. */
  readPages(data: Uint8Array): Promise<PdfPage[]>;
  /** Pagine disegnate in PNG. */
  render(data: Uint8Array, pages: readonly number[]): Promise<{ page: number; png: Buffer }[]>;
  /** Rilegge il PDF di una presentazione già importata. */
  readStored(deck: StoredDeck): Promise<Uint8Array>;
  /** Indice locale delle slide importate. */
  readonly index: Pick<SlidesIndex, 'get' | 'setMany'>;
  /** Orologio in millisecondi (per il tempo massimo di un import). */
  now(): number;
}

/**
 * Implementazione reale: file del PC, pdf.js e @napi-rs/canvas.
 *
 * @param dataDir - Cartella dei dati locali (indice delle slide).
 * @returns Il toolkit.
 */
export function defaultSlidesToolkit(dataDir: string = defaultDataDir()): SlidesToolkit {
  return {
    listFiles: listSlideFiles,
    readPages: readPdfPages,
    render: renderPdfPages,
    readStored: async (deck) => {
      const info = await stat(deck.source);
      if (!info.isDirectory()) return readZipEntry(deck.source, deck.entry);
      if ((await stat(deck.entry)).size > MAX_PDF_BYTES) throw new Error('PDF troppo grande.');
      return new Uint8Array(await readFile(deck.entry));
    },
    index: new SlidesIndex(dataDir),
    now: () => Date.now(),
  };
}
