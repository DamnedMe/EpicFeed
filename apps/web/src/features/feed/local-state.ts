'use client';

import { useSyncExternalStore } from 'react';
import type { z } from 'zod';
import type { Preferences, SavedCard, Stats } from './storage';
import {
  DEFAULT_PREFERENCES,
  DEFAULT_STATS,
  preferencesSchema,
  readValue,
  savedCardsSchema,
  statsSchema,
  STORAGE_KEYS,
  writeValue,
} from './storage';

/**
 * Valore salvato sul dispositivo e condiviso tra i componenti.
 *
 * Usa `useSyncExternalStore`: sul server e al primo render vale il
 * predefinito (niente differenze di idratazione), poi React passa al valore
 * salvato; i cambi da un'altra scheda del browser arrivano con l'evento
 * `storage`.
 */
export interface LocalValue<T> {
  get(): T;
  set(next: T | ((previous: T) => T)): void;
  subscribe(listener: () => void): () => void;
  readonly fallback: T;
}

/**
 * Crea un valore locale.
 *
 * @param key - Chiave in `localStorage` (senza prefisso).
 * @param schema - Schema per leggere valori corrotti come predefiniti.
 * @param fallback - Predefinito.
 * @returns Il valore locale.
 */
export function localValue<T>(key: string, schema: z.ZodType<T>, fallback: T): LocalValue<T> {
  let cached: { value: T } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    fallback,
    get() {
      cached ??= { value: readValue(key, schema, fallback) };
      return cached.value;
    },
    set(next) {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(this.get()) : next;
      cached = { value };
      writeValue(key, value);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === `ef:${key}`) {
          cached = null;
          listener();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}

/**
 * Legge un valore locale in un componente.
 *
 * @param value - Valore locale.
 * @returns Il valore attuale (il predefinito durante il render del server).
 */
export function useLocalValue<T>(value: LocalValue<T>): T {
  return useSyncExternalStore(
    (listener) => value.subscribe(listener),
    () => value.get(),
    () => value.fallback,
  );
}

const hydrated = { subscribe: () => () => {}, client: () => true, server: () => false };

/**
 * Dice se il componente gira nel browser dopo l'idratazione: prima di allora
 * i valori locali non sono ancora disponibili.
 *
 * @returns `true` nel browser.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(hydrated.subscribe, hydrated.client, hydrated.server);
}

export const preferences: LocalValue<Preferences> = localValue(
  STORAGE_KEYS.preferences,
  preferencesSchema,
  DEFAULT_PREFERENCES,
);
export const savedCards: LocalValue<SavedCard[]> = localValue(
  STORAGE_KEYS.saved,
  savedCardsSchema,
  [],
);
export const stats: LocalValue<Stats> = localValue(STORAGE_KEYS.stats, statsSchema, DEFAULT_STATS);
