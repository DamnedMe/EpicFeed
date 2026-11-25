'use client';

import type { CorrectionDraft, StoredCorrection } from '@epicfeed/feed';
import { useEffect, useMemo } from 'react';
import { localValue, useLocalValue } from '../local-state';
import type { CorrectionsState } from './sync';
import {
  activeCorrections,
  addLocal,
  correctionsStateSchema,
  EMPTY_CORRECTIONS,
  mergeSync,
  newCorrection,
  randomId,
  syncCorrections,
  withdrawLocal,
} from './sync';

/**
 * Correzioni dello studente sul dispositivo (`localStorage`) e
 * sincronizzazione con il server: all'apertura, dopo ogni correzione o
 * annullamento e quando torna la rete. Una sincronizzazione alla volta.
 */
export const correctionsState = localValue<CorrectionsState>(
  'corrections',
  correctionsStateSchema,
  EMPTY_CORRECTIONS,
);

let running: Promise<void> | null = null;
/** Una richiesta arrivata durante la sincronizzazione: va ripetuta alla fine. */
const queued = { again: false };
const takeQueued = () => queued.again;

/**
 * Sincronizza le correzioni. Se ne parte una mentre un'altra è in corso, la
 * si ripete alla fine, così nessuna modifica resta indietro.
 *
 * @returns Quando la sincronizzazione è finita.
 */
export function syncNow(): Promise<void> {
  if (running) {
    queued.again = true;
    return running;
  }
  running = (async () => {
    do {
      queued.again = false;
      const result = await syncCorrections(
        correctionsState.get(),
        (input, init) => fetch(input, init),
        randomId,
      );
      if (result.status === 'unauthorized') break;
      correctionsState.set((current) => mergeSync(current, result));
    } while (takeQueued());
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Salva una correzione: si vede subito e parte verso il server.
 *
 * @param subjectId - Materia.
 * @param draft - Correzione.
 * @returns La correzione salvata sul dispositivo.
 */
export function reportCorrection(subjectId: string, draft: CorrectionDraft): StoredCorrection {
  const correction = newCorrection(randomId(), subjectId, draft, new Date());
  correctionsState.set((state) => addLocal(state, correction));
  void syncNow();
  return correction;
}

/**
 * Annulla una correzione, anche sul server.
 *
 * @param id - Correzione.
 */
export function withdrawCorrection(id: string): void {
  correctionsState.set((state) => withdrawLocal(state, id));
  void syncNow();
}

/**
 * Correzioni da applicare, sincronizzate all'apertura e al ritorno della rete.
 *
 * @returns Le correzioni in ordine di creazione e gli id non ancora inviati.
 */
export function useCorrections(): {
  corrections: StoredCorrection[];
  unsent: ReadonlySet<string>;
} {
  const state = useLocalValue(correctionsState);
  useEffect(() => {
    void syncNow();
    const online = () => {
      void syncNow();
    };
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
    };
  }, []);
  return useMemo(
    () => ({
      corrections: activeCorrections(state),
      unsent: new Set(state.items.filter((i) => i.unsent).map((i) => i.correction.id)),
    }),
    [state],
  );
}
