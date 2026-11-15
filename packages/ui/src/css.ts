import type { AccentTokens, ThemeTokens } from './tokens.js';
import { accents, fonts, glass, motion, radii, themes } from './tokens.js';
import { DEFAULT_ACCENT } from './theme.js';

/** Prefisso di tutte le variabili CSS, per non scontrarsi con librerie terze. */
export const CSS_PREFIX = '--sf';

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function declarations(group: string, values: Readonly<Record<string, string>>): string[] {
  return Object.entries(values).map(
    ([name, value]) => `${CSS_PREFIX}-${group}${kebab(name)}: ${value};`,
  );
}

function themeBlock(tokens: ThemeTokens, scheme: 'dark' | 'light'): string[] {
  return [
    `color-scheme: ${scheme};`,
    ...declarations('', { ...tokens }),
    // Il colore del testo d'accento dipende dal tema; le variabili dell'accento
    // sono definite sullo stesso elemento, quindi il riferimento si risolve lì.
    `${CSS_PREFIX}-accent-text: var(${CSS_PREFIX}-accent-text-on-${scheme});`,
  ];
}

function accentBlock(tokens: AccentTokens): string[] {
  // L'etichetta è testo per la UI, non un valore CSS.
  const { fill, onFill, textOnDark, textOnLight } = tokens;
  return declarations('accent-', { fill, onFill, textOnDark, textOnLight });
}

function rule(selector: string, lines: string[], indent = ''): string {
  const body = lines.map((line) => `${indent}  ${line}`).join('\n');
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

/**
 * Genera il foglio `tokens.css` con tutte le variabili del design system.
 *
 * Come si applica:
 * - `<html data-theme="dark|light|auto" data-accent="racing-red|…">`;
 * - senza attributi vale il tema scuro con Racing red (i predefiniti);
 * - `auto` segue `prefers-color-scheme` del sistema.
 *
 * @returns Il CSS completo, deterministico (stesso input, stesso output).
 */
export function renderTokensCss(): string {
  const shared = [
    ...declarations('font-', fonts),
    ...declarations('radius-', radii),
    ...declarations('glass-', glass),
    ...declarations('motion-', motion),
  ];
  const accentRules = Object.entries(accents).map(([name, tokens]) =>
    rule(`[data-accent='${name}']`, accentBlock(tokens)),
  );

  return [
    '/* File generato da packages/ui/src/css.ts: non modificarlo a mano. */',
    rule(':root', [...shared, ...accentBlock(accents[DEFAULT_ACCENT])]),
    ...accentRules,
    rule(":root,\n[data-theme='dark']", themeBlock(themes.dark, 'dark')),
    rule("[data-theme='light']", themeBlock(themes.light, 'light')),
    `@media (prefers-color-scheme: light) {\n${rule("[data-theme='auto']", themeBlock(themes.light, 'light'), '  ')}\n}`,
    '',
  ].join('\n\n');
}
