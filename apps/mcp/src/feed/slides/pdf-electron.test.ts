import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Claude Desktop avvia il server in un processo figlio di Electron. Questo file
 * gira in un processo di test separato e simula quell'ambiente prima che
 * pdf.js venga caricato, perché pdf.js riconosce l'ambiente una volta sola.
 * Le proprietà restano di sola lettura fino alla fine del processo di test.
 */
const proc = process as NodeJS.Process & { type?: string };
const realProcess = globalThis.process;
// Come in Electron: `process.type` e `process.versions.electron` sono di sola lettura.
Object.defineProperty(process.versions, 'electron', { value: '45.3.3', enumerable: true });
Object.defineProperty(process, 'type', { value: 'utility', enumerable: true });

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${name}`, import.meta.url)));

describe('pdf.js dentro Claude Desktop (processo figlio di Electron)', () => {
  it('legge e disegna le slide e ripristina il tipo di processo', async () => {
    const { readPdfPages, renderPdfPages } = await import('./pdf.js');
    const pages = await readPdfPages(fixture('avl-trees-1.pdf'));
    expect(pages).toHaveLength(3);
    const images = await renderPdfPages(fixture('avl-trees-1.pdf'), [2]);
    expect(images[0]?.png.subarray(1, 4).toString()).toBe('PNG');
    expect(proc.type).toBe('utility');
    expect(globalThis.process).toBe(realProcess);
  });
});
