import type { AccentName, ThemeName } from './tokens.js';
import { accents } from './tokens.js';

/** Preferenza di tema scelta dall'utente: `auto` segue il sistema operativo. */
export type ThemePreference = ThemeName | 'auto';

/** Tema predefinito al primo avvio. */
export const DEFAULT_THEME: ThemePreference = 'dark';
/** Accento predefinito al primo avvio. */
export const DEFAULT_ACCENT: AccentName = 'racing-red';

/**
 * Calcola il tema effettivo a partire dalla preferenza dell'utente.
 *
 * @param preference - Preferenza salvata (`dark`, `light` o `auto`).
 * @param systemPrefersDark - Se il sistema chiede il tema scuro (`prefers-color-scheme`).
 * @returns Il tema da applicare.
 */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ThemeName {
  if (preference === 'auto') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Dice se una stringa (es. letta da IndexedDB o da un URL) è un accento valido.
 *
 * @param value - Valore da verificare.
 * @returns `true` se è il nome di un accento.
 */
export function isAccentName(value: unknown): value is AccentName {
  return typeof value === 'string' && Object.hasOwn(accents, value);
}

/**
 * Dice se una stringa è una preferenza di tema valida.
 *
 * @param value - Valore da verificare.
 * @returns `true` se è `dark`, `light` o `auto`.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'auto';
}

/**
 * Attributi da mettere sull'elemento `<html>` per applicare tema e accento.
 * Le variabili di `tokens.css` reagiscono a questi attributi, senza JavaScript
 * a runtime e senza ricaricare la pagina.
 *
 * Valori non validi (es. dati locali corrotti) ricadono sui predefiniti.
 *
 * @param preference - Preferenza di tema.
 * @param accent - Accento scelto.
 * @returns Gli attributi `data-theme` e `data-accent`.
 */
export function themeAttributes(
  preference: unknown,
  accent: unknown,
): { 'data-theme': ThemePreference; 'data-accent': AccentName } {
  return {
    'data-theme': isThemePreference(preference) ? preference : DEFAULT_THEME,
    'data-accent': isAccentName(accent) ? accent : DEFAULT_ACCENT,
  };
}
