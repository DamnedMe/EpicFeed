import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast.js';
import { accents, themes } from './tokens.js';

// WCAG 2.2 AA: 4,5:1 per il testo normale.
const AA_TEXT = 4.5;

describe('contrasto dei temi', () => {
  it.each(Object.entries(themes))('tema %s: testi leggibili sul fondo', (_name, theme) => {
    for (const color of [theme.text, theme.textMuted, theme.review]) {
      expect(contrastRatio(color, theme.background)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('contrasto degli accenti', () => {
  it.each(Object.entries(accents))(
    '%s: testo sul tema scuro, sul chiaro e sopra il riempimento',
    (_name, accent) => {
      expect(contrastRatio(accent.textOnDark, themes.dark.background)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(accent.textOnLight, themes.light.background)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(accent.onFill, accent.fill)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );
});

describe('contrastRatio', () => {
  it("bianco su nero è 21:1 e non dipende dall'ordine", () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('rifiuta formati non validi', () => {
    expect(() => relativeLuminance('red')).toThrow(/Colore non valido/);
  });
});
