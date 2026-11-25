import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import { normalizeText, requirePosition, requireTitle } from './text.js';

describe('normalizeText', () => {
  it('unifica fine riga, spazi in coda e righe vuote multiple', () => {
    expect(normalizeText('  Ciao\r\nmondo   \r\n\r\n\r\n\r\nfine\t \n')).toBe(
      'Ciao\nmondo\n\nfine',
    );
  });

  it('porta le lettere accentate in forma NFC', () => {
    const decomposed = 'perché';
    expect(normalizeText(decomposed)).toBe('perché');
  });

  it("conserva l'indentazione del codice", () => {
    expect(normalizeText('```js\n  const a = 1;\n```')).toBe('```js\n  const a = 1;\n```');
  });

  it('tratta spazi non separabili e tab come spazi', () => {
    expect(normalizeText('a b\tc  ')).toBe('a b c');
  });
});

describe('requireTitle', () => {
  it('compatta gli spazi', () => {
    expect(requireTitle('  Le  closure\n in JS ', 'Titolo')).toBe('Le closure in JS');
  });

  it('rifiuta titoli vuoti o troppo lunghi', () => {
    expect(() => requireTitle('   ', 'Titolo')).toThrow(DomainError);
    expect(() => requireTitle('x'.repeat(11), 'Titolo', 10)).toThrow(/supera/);
  });
});

describe('requirePosition', () => {
  it('accetta interi non negativi', () => {
    expect(requirePosition(0, 'Posizione')).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])('rifiuta %s', (value) => {
    expect(() => requirePosition(value, 'Posizione')).toThrow(DomainError);
  });
});
