import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Claude Desktop avvia il server in un processo figlio di Electron. Questo file
 * gira in un processo di test separato e simula quell'ambiente prima che
 * pdf.js venga caricato, perché pdf.js riconosce l'ambiente una volta sola.
 */
const proc = process as NodeJS.Process & { type?: string };
const hadElectron = 'electron' in process.versions;
Object.defineProperty(process.versions, 'electron', {
  value: '45.3.3',
  enumerable: true,
  configurable: true,
});
proc.type = 'utility';

afterAll(() => {
  if (!hadElectron) {
    Reflect.deleteProperty(process.versions, 'electron');
  }
  delete proc.type;
});

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url)));

describe('pdf.js dentro Claude Desktop (processo figlio di Electron)', () => {
  it('legge e disegna le slide e ripristina il tipo di processo', async () => {
    const { readPdfPages, renderPdfPages } = await import('./pdf.js');
    const pages = await readPdfPages(fixture('avl-trees-1.pdf'));
    expect(pages).toHaveLength(3);
    const images = await renderPdfPages(fixture('avl-trees-1.pdf'), [2]);
    expect(images[0]?.png.subarray(1, 4).toString()).toBe('PNG');
    expect(proc.type).toBe('utility');
  });
});
