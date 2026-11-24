import { describe, expect, it } from 'vitest';
import type { LessonPartContent } from './content.js';
import { computeContentHash, parseContentHash, webCryptoSha256 } from './content-hash.js';
import { DomainError } from '@epicfeed/shared';

const content: LessonPartContent = {
  kind: 'video',
  summaries: { it: 'Le closure ricordano lo scope in cui sono nate.' },
};

describe('webCryptoSha256', () => {
  it('rispetta il vettore di prova NIST per "abc"', async () => {
    const digest = await webCryptoSha256(new TextEncoder().encode('abc'));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('computeContentHash', () => {
  it('restituisce 64 caratteri esadecimali', async () => {
    expect(await computeContentHash(content)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('è stabile rispetto a differenze invisibili (spazi, fine riga, ordine)', async () => {
    const noisy = {
      summaries: { it: 'Le closure ricordano lo scope in cui sono nate.   \r\n', en: '' },
      kind: 'video',
    } as LessonPartContent;
    expect(await computeContentHash(noisy)).toBe(await computeContentHash(content));
  });

  it('cambia se Epicode modifica il contenuto (nuova versione)', async () => {
    const changed: LessonPartContent = {
      kind: 'video',
      summaries: { it: 'Le closure ricordano lo scope.' },
    };
    expect(await computeContentHash(changed)).not.toBe(await computeContentHash(content));
  });

  it('usa il digest iniettato sul JSON canonico in UTF-8', async () => {
    let received = '';
    const fake = (data: Uint8Array) => {
      received = new TextDecoder().decode(data);
      return Promise.resolve(new Uint8Array([0, 15, 255]));
    };
    const hash = await computeContentHash({ kind: 'reading', markdown: 'è' }, fake);
    expect(received).toBe('{"kind":"reading","markdown":"è"}');
    expect(hash).toBe('000fff');
  });
});

describe('parseContentHash', () => {
  it('accetta un hash valido', () => {
    const value = 'a'.repeat(64);
    expect(parseContentHash(value)).toBe(value);
  });

  it.each(['', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63)])('rifiuta %j', (value) => {
    expect(() => parseContentHash(value)).toThrow(DomainError);
  });
});
