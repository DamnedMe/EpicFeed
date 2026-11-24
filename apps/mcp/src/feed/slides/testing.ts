import type { SlideFile } from './archive.js';
import type { PdfPage } from './pdf.js';
import type { StoredDeck } from './store.js';
import type { SlidesToolkit } from './toolkit.js';

/**
 * Toolkit delle slide in memoria, per i test: i "PDF" sono testi, ogni riga
 * è una pagina e una riga che inizia con `[figura]` è una pagina con figura.
 *
 * @param pdfs - Contenuto dei PDF per nome del file.
 * @returns Il toolkit e l'indice in memoria.
 */
export function memorySlidesToolkit(pdfs: Record<string, string> = {}) {
  const stored = new Map<string, readonly StoredDeck[]>();
  let clock = 0;
  const files: SlideFile[] = Object.keys(pdfs).map((fileName) => ({
    fileName,
    entry: `Course downloads/${fileName}`,
    read: () => Promise.resolve(new TextEncoder().encode(pdfs[fileName])),
  }));
  const kit: SlidesToolkit & { tick: (ms: number) => void } = {
    listFiles: () => Promise.resolve(files),
    readPages: (data) =>
      Promise.resolve(
        new TextDecoder()
          .decode(data)
          .split('\n')
          .map((text, index): PdfPage => ({
            number: index + 1,
            text: text.replace('[figura]', '').trim(),
            figureScore: text.startsWith('[figura]') ? 20 : 0,
          })),
      ),
    render: (_data, pages) =>
      Promise.resolve(pages.map((page) => ({ page, png: Buffer.from(`png-${String(page)}`) }))),
    readStored: (deck) => {
      const name = deck.entry.split('/').pop() ?? '';
      const content = pdfs[name];
      return content === undefined
        ? Promise.reject(new Error('sparito'))
        : Promise.resolve(new TextEncoder().encode(content));
    },
    index: {
      get: (lessonId) => Promise.resolve(stored.get(lessonId) ?? []),
      setMany: (entries) => {
        for (const [key, value] of entries) stored.set(key, value);
        return Promise.resolve();
      },
    },
    now: () => clock,
    tick: (ms) => {
      clock += ms;
    },
  };
  return { kit, stored };
}
