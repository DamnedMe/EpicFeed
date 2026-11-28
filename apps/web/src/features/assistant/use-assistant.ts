'use client';

import type { DailyUsage } from '@epicfeed/assistant';
import { addRequest } from '@epicfeed/assistant';
import { useCallback, useEffect, useState } from 'react';
import type { AssistantSettings } from './key-store';
import { assistantKeyStore } from './key-store';

/** Stato della chiave sul dispositivo. */
export interface AssistantState {
  /** `undefined` finché non è letta, `null` se non c'è. */
  readonly settings: AssistantSettings | null | undefined;
  readonly usage: DailyUsage | null;
  /** Salva la chiave (o il nuovo modello). */
  readonly save: (settings: AssistantSettings) => Promise<void>;
  /** Cancella la chiave dal dispositivo. */
  readonly remove: () => Promise<void>;
  /** Conta una richiesta fatta. */
  readonly countRequest: () => Promise<void>;
}

/**
 * Chiave dell'assistente e richieste del giorno, letti da IndexedDB.
 *
 * @returns Lo stato e le azioni.
 */
export function useAssistant(): AssistantState {
  const [settings, setSettings] = useState<AssistantSettings | null | undefined>(undefined);
  const [usage, setUsage] = useState<DailyUsage | null>(null);

  useEffect(() => {
    const mounted = { current: true };
    void (async () => {
      const store = await assistantKeyStore();
      const [loaded, counted] = store
        ? await Promise.all([store.load(), store.loadUsage()]).catch(() => [null, null] as const)
        : [null, null];
      if (!mounted.current) return;
      setSettings(loaded);
      setUsage(counted);
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = useCallback(async (next: AssistantSettings) => {
    const store = await assistantKeyStore();
    await store?.save(next);
    setSettings(next);
  }, []);

  const remove = useCallback(async () => {
    const store = await assistantKeyStore();
    await store?.remove();
    setSettings(null);
  }, []);

  const countRequest = useCallback(async () => {
    const store = await assistantKeyStore();
    const next = addRequest(store ? await store.loadUsage() : null, new Date());
    await store?.saveUsage(next);
    setUsage(next);
  }, []);

  return { settings, usage, save, remove, countRequest };
}
