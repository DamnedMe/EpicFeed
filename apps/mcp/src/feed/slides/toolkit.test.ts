import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultSlidesToolkit } from './toolkit.js';

const fixtures = fileURLToPath(new URL('../../../test/fixtures/', import.meta.url));

describe('defaultSlidesToolkit', () => {
  it('rilegge i PDF importati da uno zip o da una cartella', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'epicfeed-'));
    const kit = defaultSlidesToolkit(dataDir);
    const fromZip = await kit.readStored({
      number: 1,
      source: join(fixtures, 'course-downloads.zip'),
      entry: 'Course downloads/AVL trees-1.pdf',
    });
    expect(Buffer.from(fromZip).subarray(0, 4).toString()).toBe('%PDF');
    const file = join(dataDir, 'Heaps-1.pdf');
    await writeFile(file, '%PDF-1.4');
    const fromFolder = await kit.readStored({ number: 1, source: dataDir, entry: file });
    expect(Buffer.from(fromFolder).toString()).toBe('%PDF-1.4');
    expect(kit.now()).toBeGreaterThan(0);
    expect(await kit.index.get('l1')).toEqual([]);
  });
});
