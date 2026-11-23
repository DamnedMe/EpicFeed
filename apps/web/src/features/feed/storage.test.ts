import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from './storage';
import {
  DEFAULT_PREFERENCES,
  preferencesSchema,
  readValue,
  removeValue,
  STORAGE_KEYS,
  writeValue,
} from './storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const broken: KeyValueStore = {
  getItem: () => {
    throw new Error('negato');
  },
  setItem: () => {
    throw new Error('pieno');
  },
  removeItem: () => {
    throw new Error('negato');
  },
};

describe('storage', () => {
  it('salva, legge e cancella con il prefisso', () => {
    const store = memoryStore();
    expect(writeValue(STORAGE_KEYS.position('s1'), 'k', store)).toBe(true);
    expect(store.data.has('ef:position:s1')).toBe(true);
    expect(
      readValue(STORAGE_KEYS.position('s1'), preferencesSchema.shape.language, 'it', store),
    ).toBe('it');
    removeValue(STORAGE_KEYS.position('s1'), store);
    expect(store.data.size).toBe(0);
  });

  it('ricade sul predefinito per valori corrotti o assenti', () => {
    const store = memoryStore();
    store.data.set('ef:preferences', '{"language":"fr","points":false}');
    expect(
      readValue(STORAGE_KEYS.preferences, preferencesSchema, DEFAULT_PREFERENCES, store),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      points: false,
    });
    store.data.set('ef:stats', '{non json');
    expect(readValue(STORAGE_KEYS.stats, preferencesSchema, DEFAULT_PREFERENCES, store)).toBe(
      DEFAULT_PREFERENCES,
    );
    expect(readValue('assente', preferencesSchema, DEFAULT_PREFERENCES, store)).toBe(
      DEFAULT_PREFERENCES,
    );
  });

  it('non lancia eccezioni senza spazio o senza accesso', () => {
    expect(writeValue('x', 1, broken)).toBe(false);
    expect(writeValue('x', 1, null)).toBe(false);
    expect(readValue('x', preferencesSchema, DEFAULT_PREFERENCES, broken)).toBe(
      DEFAULT_PREFERENCES,
    );
    expect(() => {
      removeValue('x', broken);
    }).not.toThrow();
    expect(readValue('x', preferencesSchema, DEFAULT_PREFERENCES)).toBe(DEFAULT_PREFERENCES);
  });
});
