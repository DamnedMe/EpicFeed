import { mkdtemp, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SlidesIndex, defaultDataDir } from './store.js';

describe('SlidesIndex', () => {
  it('ricorda dove sono le slide di ogni lezione', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'epicfeed-')), 'dati');
    const index = new SlidesIndex(dir);
    expect(await index.get('L1')).toEqual([]);
    const deck = { number: 1, source: 'C:\\slides.zip', entry: 'AVL trees-1.pdf' };
    await index.setMany(new Map([['L1', [deck]]]));
    await index.setMany(new Map([['l2', []]]));
    expect(await new SlidesIndex(dir).get('l1')).toEqual([deck]);
  });

  it('riparte da vuoto se il file è rovinato', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'epicfeed-'));
    await writeFile(join(dir, 'slides.json'), 'non json');
    expect(await new SlidesIndex(dir).get('l1')).toEqual([]);
    await writeFile(join(dir, 'slides.json'), 'null');
    expect(await new SlidesIndex(dir).get('l1')).toEqual([]);
  });
});

describe('defaultDataDir', () => {
  it('usa la cartella dei dati del sistema', () => {
    expect(defaultDataDir({ EPICFEED_DATA_DIR: '/x' }, 'linux')).toBe('/x');
    expect(defaultDataDir({ APPDATA: 'C:\\Users\\D\\AppData\\Roaming' }, 'win32')).toBe(
      join('C:\\Users\\D\\AppData\\Roaming', 'EpicFeed'),
    );
    expect(defaultDataDir({}, 'win32')).toBe(join(homedir(), 'AppData', 'Roaming', 'EpicFeed'));
    expect(defaultDataDir({}, 'darwin')).toBe(
      join(homedir(), 'Library', 'Application Support', 'EpicFeed'),
    );
    expect(defaultDataDir({}, 'linux')).toBe(join(homedir(), '.config', 'epicfeed'));
  });
});
