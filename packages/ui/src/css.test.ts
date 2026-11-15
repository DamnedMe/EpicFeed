import { describe, expect, it } from 'vitest';
import { renderTokensCss } from './css.js';
import { accents } from './tokens.js';

describe('renderTokensCss', () => {
  const css = renderTokensCss();

  it('è deterministico', () => {
    expect(renderTokensCss()).toBe(css);
  });

  it('di default applica tema scuro e Racing red', () => {
    expect(css).toMatch(/:root \{[^}]*--sf-accent-fill: #E10600;/);
    expect(css).toMatch(/:root,\n\[data-theme='dark'\] \{[^}]*--sf-background: #0B0B0E;/);
  });

  it('definisce una regola per ogni accento', () => {
    for (const [name, accent] of Object.entries(accents)) {
      expect(css).toContain(`[data-accent='${name}'] {\n  --sf-accent-fill: ${accent.fill};`);
    }
    expect(css).not.toContain('label');
  });

  it("il testo d'accento segue il tema", () => {
    expect(css).toMatch(
      /\[data-theme='light'\] \{[^}]*--sf-accent-text: var\(--sf-accent-text-on-light\);/,
    );
  });

  it('il tema automatico segue il sistema', () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: light\) \{\n {2}\[data-theme='auto'\] \{[^}]*--sf-background: #EDF0F3;/,
    );
  });

  it('contiene font, raggi, vetro e animazioni', () => {
    expect(css).toContain("--sf-font-display: 'Space Grotesk'");
    expect(css).toContain('--sf-radius-card: 26px;');
    expect(css).toContain('--sf-glass-blur: 22px;');
    expect(css).toContain('--sf-motion-easing:');
  });
});
