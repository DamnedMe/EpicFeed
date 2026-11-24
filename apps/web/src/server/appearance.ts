import 'server-only';
import { cookies } from 'next/headers';
import type { AccentName, ThemePreference } from '@epicfeed/ui';
import { themeAttributes } from '@epicfeed/ui';

/** Cookie di tema e accento: il server li legge per disegnare la pagina già nei colori scelti, senza lampi. */
export const APPEARANCE_COOKIES = { theme: 'ef-theme', accent: 'ef-accent' } as const;

/**
 * Tema e accento scelti in *Io*, letti dai cookie. Valori mancanti o non
 * validi ricadono sui predefiniti del design system.
 *
 * @returns Gli attributi da mettere su `<html>`.
 */
export async function readAppearance(): Promise<{
  'data-theme': ThemePreference;
  'data-accent': AccentName;
}> {
  const store = await cookies();
  return themeAttributes(
    store.get(APPEARANCE_COOKIES.theme)?.value,
    store.get(APPEARANCE_COOKIES.accent)?.value,
  );
}
