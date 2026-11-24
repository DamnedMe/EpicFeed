import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listSlideFiles, readZipEntry } from './archive.js';

const fixtures = fileURLToPath(new URL('../../../test/fixtures/', import.meta.url));
const zip = join(fixtures, 'course-downloads.zip');

describe('listSlideFiles', () => {
  it('elenca solo i PDF dello zip, senza le voci di sistema di macOS', async () => {
    const files = await listSlideFiles(zip);
    expect(files.map((file) => file.fileName)).toEqual([
      'AVL trees-1.pdf',
      'AVL trees-2.pdf',
      'Unknown lesson-1.pdf',
    ]);
    expect(files[0]?.entry).toBe('Course downloads/AVL trees-1.pdf');
    const data = await files[0]?.read();
    expect(
      Buffer.from(data ?? [])
        .subarray(0, 4)
        .toString(),
    ).toBe('%PDF');
  });

  it('elenca i PDF di una cartella, anche nelle sottocartelle', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epicfeed-'));
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'sub', 'Heaps-1.PDF'), '%PDF-1.4');
    await writeFile(join(dir, 'note.txt'), 'x');
    const files = await listSlideFiles(dir);
    expect(files.map((file) => file.fileName)).toEqual(['Heaps-1.PDF']);
    expect(Buffer.from((await files[0]?.read()) ?? []).toString()).toBe('%PDF-1.4');
  });

  it('spiega quando il percorso non esiste o non è uno zip', async () => {
    await expect(listSlideFiles(join(fixtures, 'nessuno.zip'))).rejects.toThrow(/Non trovo/);
    await expect(listSlideFiles(join(fixtures, 'avl-trees-1.pdf'))).rejects.toThrow(
      /non è uno zip valido/,
    );
  });
});

describe('readZipEntry', () => {
  it('segnala una voce che non è più nello zip', async () => {
    await expect(readZipEntry(zip, 'Course downloads/Assente-1.pdf')).rejects.toThrow(
      /non è più nello zip/,
    );
  });
});
