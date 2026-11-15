import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  isAccentName,
  isThemePreference,
  resolveTheme,
  themeAttributes,
} from './theme.js';

describe('resolveTheme', () => {
  it('rispetta la scelta esplicita', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('in automatico segue il sistema', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });
});

describe('validazione', () => {
  it('riconosce accenti e preferenze validi', () => {
    expect(isAccentName('turchese')).toBe(true);
    expect(isAccentName('toString')).toBe(false);
    expect(isAccentName(42)).toBe(false);
    expect(isThemePreference('auto')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
  });
});

describe('themeAttributes', () => {
  it('produce gli attributi per <html>', () => {
    expect(themeAttributes('light', 'verde-lime')).toEqual({
      'data-theme': 'light',
      'data-accent': 'verde-lime',
    });
  });

  it('con valori non validi usa scuro e Racing red', () => {
    expect(themeAttributes(undefined, '<script>')).toEqual({
      'data-theme': DEFAULT_THEME,
      'data-accent': DEFAULT_ACCENT,
    });
    expect(DEFAULT_THEME).toBe('dark');
    expect(DEFAULT_ACCENT).toBe('racing-red');
  });
});
