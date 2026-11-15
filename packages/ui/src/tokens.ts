/**
 * Token del design system "Inchiostro" (approvato da Damian il 14/11/2026).
 *
 * È l'unica fonte dei valori: da qui si generano `tokens.css` (variabili CSS
 * usate dalla web app e dall'estensione) e i tipi TypeScript. Le specifiche
 * leggibili sono in `docs/design-system.md`.
 */

/** Valori di un tema (scuro o chiaro). */
export interface ThemeTokens {
  /** Fondo dell'app. */
  readonly background: string;
  /** Superficie in vetro (card, barra di navigazione). */
  readonly surface: string;
  /** Bordo sottile delle superfici in vetro. */
  readonly border: string;
  /** Testo principale. */
  readonly text: string;
  /** Testo secondario (etichette, metadati). */
  readonly textMuted: string;
  /** Concetti da ripassare e risposte sbagliate: neutro, mai rosso. */
  readonly review: string;
}

/** Temi disponibili. */
export const themes = {
  dark: {
    background: '#0B0B0E',
    surface: 'rgba(255, 255, 255, 0.07)',
    border: 'rgba(255, 255, 255, 0.10)',
    text: '#DCE3EA',
    textMuted: '#98A0A9',
    review: '#DCE3EA',
  },
  light: {
    background: '#EDF0F3',
    surface: 'rgba(255, 255, 255, 0.72)',
    border: 'rgba(11, 11, 14, 0.08)',
    text: '#0B0B0E',
    textMuted: '#5B6570',
    review: '#4A535D',
  },
} as const satisfies Record<'dark' | 'light', ThemeTokens>;

/** Nome di un tema concreto. */
export type ThemeName = keyof typeof themes;

/** Valori di un accento. */
export interface AccentTokens {
  /** Nome mostrato all'utente nella sezione Io. */
  readonly label: string;
  /** Riempimento di pulsanti, barre di progresso, voce attiva. */
  readonly fill: string;
  /** Testo o icona sopra il riempimento. */
  readonly onFill: string;
  /** Testo in colore d'accento sul tema scuro. */
  readonly textOnDark: string;
  /** Testo in colore d'accento sul tema chiaro. */
  readonly textOnLight: string;
}

/**
 * Accenti a scelta dell'utente. L'accento colora azioni, progresso, voce
 * attiva e risposta giusta (con il rosso la risposta giusta va sempre
 * accompagnata da un'icona di spunta).
 */
export const accents = {
  'racing-red': {
    label: 'Racing red',
    fill: '#E10600',
    onFill: '#FFFFFF',
    textOnDark: '#FF4D3D',
    textOnLight: '#C80500',
  },
  'electric-violet': {
    label: 'Electric violet',
    fill: '#8F00FF',
    onFill: '#FFFFFF',
    textOnDark: '#B266FF',
    textOnLight: '#7A00DB',
  },
  'blu-oltremare': {
    label: 'Blu oltremare',
    fill: '#2340FF',
    onFill: '#FFFFFF',
    textOnDark: '#8593FF',
    textOnLight: '#2340FF',
  },
  turchese: {
    label: 'Turchese',
    fill: '#30D5C8',
    onFill: '#0B0B0E',
    textOnDark: '#30D5C8',
    // Approvato come #0B7F76; scurito appena per arrivare al contrasto
    // WCAG AA (4,5:1) sul fondo chiaro: 4,26 → 4,67.
    textOnLight: '#0A7870',
  },
  'verde-lime': {
    label: 'Verde lime',
    fill: '#A3E635',
    onFill: '#0B0B0E',
    textOnDark: '#A3E635',
    textOnLight: '#3F6B0A',
  },
} as const satisfies Record<string, AccentTokens>;

/** Nome di un accento. */
export type AccentName = keyof typeof accents;

/** Famiglie di caratteri. I font sono self-hosted dalla web app (`next/font`). */
export const fonts = {
  /** Titoli: Space Grotesk 700. */
  display: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  /** Testo: Inter 400/500/600. */
  body: "'Inter', ui-sans-serif, system-ui, sans-serif",
  /** Etichette, codice, contatori: JetBrains Mono 400/500. */
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/** Raggi degli angoli. */
export const radii = {
  sm: '10px',
  md: '16px',
  lg: '22px',
  card: '26px',
  device: '46px',
  pill: '999px',
} as const;

/** Effetto vetro: sfocatura dello sfondo sotto le superfici. */
export const glass = {
  blur: '22px',
} as const;

/** Durate e curve delle animazioni (lo swipe del feed resta sotto i 100 ms di risposta). */
export const motion = {
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;
