import { z } from 'zod';

/**
 * Dati del feed che restano **solo sul dispositivo** (ADR 0003, ADR 0015):
 * preferenze, posizione, schede salvate, punti e la materia scaricata.
 *
 * `localStorage` può mancare o lanciare eccezioni (navigazione privata, dati
 * cancellati, spazio finito): ogni accesso è protetto e i dati letti passano
 * da uno schema, perché un valore corrotto non deve rompere il feed.
 */

const PREFIX = 'ef:';

/** Spazio dei dati, sostituibile nei test. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Spazio dei dati predefinito: `localStorage`, se c'è e si può usare.
 *
 * @returns Lo spazio, oppure `null` (sul server o con l'accesso negato).
 */
export function defaultStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Legge un valore salvato.
 *
 * @param key - Chiave senza prefisso.
 * @param schema - Schema del valore.
 * @param fallback - Valore se manca, non è leggibile o non rispetta lo schema.
 * @param store - Spazio dei dati (predefinito `localStorage`).
 * @returns Il valore.
 */
export function readValue<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
  store: KeyValueStore | null = defaultStore(),
): T {
  try {
    const raw = store?.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Salva un valore. Un errore (spazio finito, accesso negato) non interrompe
 * lo studio: il valore resta solo in memoria.
 *
 * @param key - Chiave senza prefisso.
 * @param value - Valore serializzabile in JSON.
 * @param store - Spazio dei dati (predefinito `localStorage`).
 * @returns `true` se salvato.
 */
export function writeValue(
  key: string,
  value: unknown,
  store: KeyValueStore | null = defaultStore(),
): boolean {
  try {
    if (!store) return false;
    store.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancella un valore salvato.
 *
 * @param key - Chiave senza prefisso.
 * @param store - Spazio dei dati (predefinito `localStorage`).
 */
export function removeValue(key: string, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(PREFIX + key);
  } catch {
    // Niente da fare: il valore resterà, e verrà ignorato o sovrascritto.
  }
}

/** Preferenze di studio (sezione *Io*). */
export const preferencesSchema = z.object({
  language: z.enum(['it', 'en']).catch('it'),
  /** Lingua delle domande: inglese di base, per allenarsi all'esame (ADR 0011). */
  quizLanguage: z.enum(['it', 'en']).catch('en'),
  points: z.boolean().catch(true),
  vibration: z.boolean().catch(true),
  animations: z.boolean().catch(true),
  autoAdvance: z.boolean().catch(false),
  introSeen: z.boolean().catch(false),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = {
  language: 'it',
  quizLanguage: 'en',
  points: true,
  vibration: true,
  animations: true,
  autoAdvance: false,
  introSeen: false,
};

/** Scheda salvata con il doppio tocco, con quanto serve per elencarla in *Io*. */
export const savedCardSchema = z.object({
  key: z.string().max(200),
  subjectId: z.string().max(64),
  lessonTitle: z.string().max(300),
  title: z.object({ it: z.string().max(300), en: z.string().max(300) }),
  savedAt: z.string().max(40),
});
export type SavedCard = z.infer<typeof savedCardSchema>;
export const savedCardsSchema = z.array(savedCardSchema).max(2000);

/** Totali di studio sul dispositivo. */
export const statsSchema = z.object({
  points: z.number().int().min(0).catch(0),
  bestStreak: z.number().int().min(0).catch(0),
  sessions: z.number().int().min(0).catch(0),
});
export type Stats = z.infer<typeof statsSchema>;
export const DEFAULT_STATS: Stats = { points: 0, bestStreak: 0, sessions: 0 };

/** Chiavi usate dal feed. */
export const STORAGE_KEYS = {
  preferences: 'preferences',
  saved: 'saved',
  stats: 'stats',
  subject: 'subject',
  position: (subjectId: string) => `position:${subjectId}`,
  feed: (subjectId: string) => `feed:${subjectId}`,
} as const;
