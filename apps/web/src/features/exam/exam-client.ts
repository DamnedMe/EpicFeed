import type { ExamContentResponse } from '@epicfeed/exam';
import { examContentResponseSchema } from '@epicfeed/exam';
import type { KeyValueStore } from '../feed/storage';
import { defaultStore, readValue, STORAGE_KEYS, writeValue } from '../feed/storage';

/**
 * Scaricamento dei contenuti d'esame di una materia (M4). Come il feed: si
 * mostra subito la copia sul dispositivo e si chiede al server se è cambiata
 * (`If-None-Match`); senza rete resta la copia.
 */

/** Esito del caricamento. */
export type ExamLoad =
  | { readonly status: 'unauthorized' }
  | { readonly status: 'ready'; readonly content: ExamContentResponse; readonly offline: boolean }
  | { readonly status: 'error' };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Copia dei contenuti sul dispositivo, se c'è e rispetta lo schema.
 *
 * @param subjectId - Materia.
 * @param store - Spazio dei dati (predefinito `localStorage`).
 * @returns I contenuti salvati, oppure `null`.
 */
export function readCachedExam(
  subjectId: string,
  store: KeyValueStore | null = defaultStore(),
): ExamContentResponse | null {
  const cached = readValue(
    STORAGE_KEYS.exam(subjectId),
    examContentResponseSchema,
    null as ExamContentResponse | null,
    store,
  );
  return cached?.subjectId === subjectId ? cached : null;
}

/**
 * Chiede al server i contenuti d'esame, usando e aggiornando la copia sul
 * dispositivo.
 *
 * @param fetchImpl - `fetch` (sostituibile nei test).
 * @param subjectId - Materia.
 * @param store - Spazio dei dati (predefinito `localStorage`).
 * @returns L'esito.
 */
export async function loadExamContent(
  fetchImpl: Fetch,
  subjectId: string,
  store: KeyValueStore | null = defaultStore(),
): Promise<ExamLoad> {
  const cached = readCachedExam(subjectId, store);
  try {
    const response = await fetchImpl(`/api/exam/subjects/${encodeURIComponent(subjectId)}`, {
      cache: 'no-store',
      headers: cached ? { 'If-None-Match': `"${cached.version}"` } : {},
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 304 && cached) {
      return { status: 'ready', content: cached, offline: false };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = examContentResponseSchema.parse(await response.json());
    // Se lo spazio è finito la copia non si salva: la sezione funziona lo stesso online.
    writeValue(STORAGE_KEYS.exam(subjectId), content, store);
    return { status: 'ready', content, offline: false };
  } catch {
    return cached ? { status: 'ready', content: cached, offline: true } : { status: 'error' };
  }
}
