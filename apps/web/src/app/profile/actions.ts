'use server';

import { cookies } from 'next/headers';
import { isAccentName, isThemePreference } from '@study-feed/ui';
import { APPEARANCE_COOKIES } from '@/server/appearance';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Salva tema o accento in un cookie (sezione *Io*, ADR 0015 punto 7). Non è
 * un dato personale sensibile: resta sul dispositivo come le altre
 * preferenze, ma in un cookie perché il server lo usi già al primo render.
 *
 * @param kind - `theme` o `accent`.
 * @param value - Valore scelto; i valori non validi vengono ignorati.
 */
export async function saveAppearance(kind: 'theme' | 'accent', value: string): Promise<void> {
  const valid = kind === 'theme' ? isThemePreference(value) : isAccentName(value);
  if (!valid) return;
  const store = await cookies();
  store.set(APPEARANCE_COOKIES[kind], value, {
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/',
  });
}
