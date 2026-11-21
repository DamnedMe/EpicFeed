import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FIGURE_THRESHOLD,
  IMAGE_WIDTH,
  pickFigurePages,
  readPdfPages,
  renderPdfPages,
} from './pdf.js';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url)));

describe('readPdfPages', () => {
  it('estrae il testo per pagina e riconosce il diagramma', async () => {
    const pages = await readPdfPages(fixture('avl-trees-1.pdf'));
    expect(pages.map((page) => page.number)).toEqual([1, 2, 3]);
    expect(pages[0]?.text).toContain('An AVL tree is a self-balancing binary search tree.');
    expect(pages[0]?.text.split('\n').length).toBeGreaterThan(3);
    expect(pages[1]?.figureScore).toBeGreaterThanOrEqual(FIGURE_THRESHOLD);
    expect(pages[0]?.figureScore).toBeLessThan(FIGURE_THRESHOLD);
    expect(pages[2]?.figureScore).toBeLessThan(FIGURE_THRESHOLD);
  });

  it('ignora le immagini del modello presenti in ogni pagina', async () => {
    const pages = await readPdfPages(fixture('template-deck.pdf'));
    const figures = pages.filter((page) => page.figureScore >= FIGURE_THRESHOLD);
    expect(figures.map((page) => page.number)).toEqual([3]);
  });
});

describe('renderPdfPages', () => {
  it('disegna le pagine richieste in PNG larghi 1280 pixel', async () => {
    const images = await renderPdfPages(fixture('avl-trees-1.pdf'), [2, 99]);
    expect(images).toHaveLength(1);
    const png = images[0]?.png ?? Buffer.alloc(0);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(IMAGE_WIDTH);
  });
});

describe('pickFigurePages', () => {
  it('sceglie le figure più ricche entro il tetto, in ordine di lettura', () => {
    const page = (number: number, figureScore: number) => ({ number, text: '', figureScore });
    const decks = [
      { number: 2, pages: [page(1, 50), page(2, 0)] },
      { number: 1, pages: [page(1, 10), page(2, 7), page(3, 30)] },
    ];
    expect(pickFigurePages(decks, 3)).toEqual([
      { deck: 1, page: 1 },
      { deck: 1, page: 3 },
      { deck: 2, page: 1 },
    ]);
  });
});
