import type { CorrectionDraft, StoredCorrection } from '@epicfeed/feed';
import { initialClaudeStatus, storedCorrectionSchema } from '@epicfeed/feed';
import * as z from 'zod';

/**
 * Correzioni sul dispositivo e loro invio al server (ADR 0020, scelta 4).
 *
 * Una correzione si vede subito, anche senza rete: entra nell'elenco locale
 * come *da inviare* e parte alla prossima sincronizzazione. L'id lo sceglie
 * l'app, quindi reinviare dopo un errore di rete non crea doppioni. Funzioni
 * pure sullo stato, provate senza browser; il collegamento a `localStorage`
 * e agli eventi sta in `use-corrections.ts`.
 */

/** Stato delle correzioni sul dispositivo. */
export interface CorrectionsState {
  readonly items: readonly {
    readonly correction: StoredCorrection;
    /** `true` finché il server non l'ha salvata. */
    readonly unsent: boolean;
  }[];
  /** Correzioni annullate da cancellare anche sul server. */
  readonly withdrawn: readonly string[];
}

/** Schema dello stato salvato: un valore corrotto vale come stato vuoto. */
export const correctionsStateSchema: z.ZodType<CorrectionsState> = z.object({
  items: z.array(z.object({ correction: storedCorrectionSchema, unsent: z.boolean() })).max(1200),
  withdrawn: z.array(z.uuid()).max(1200),
});

/**
 * Id nuovo (UUID v4). `crypto.randomUUID` c'è solo nelle pagine sicure e nei
 * browser recenti: altrimenti lo si compone con `crypto.getRandomValues`.
 *
 * @param source - Generatore crittografico (predefinito `globalThis.crypto`).
 * @returns L'id.
 */
export function randomId(
  source: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = globalThis.crypto,
): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stato iniziale. */
export const EMPTY_CORRECTIONS: CorrectionsState = { items: [], withdrawn: [] };

/**
 * Crea una correzione locale, da inviare.
 *
 * @param id - Id nuovo (UUID).
 * @param subjectId - Materia.
 * @param correction - Correzione dello studente.
 * @param now - Istante di creazione.
 * @returns La correzione con lo stato iniziale del lavoro di Claude.
 */
export function newCorrection(
  id: string,
  subjectId: string,
  correction: CorrectionDraft,
  now: Date,
): StoredCorrection {
  return {
    id,
    subjectId,
    correction,
    claudeStatus: initialClaudeStatus(correction),
    completion: null,
    createdAt: now.toISOString(),
  };
}

/** Aggiunge una correzione da inviare. */
export function addLocal(state: CorrectionsState, correction: StoredCorrection): CorrectionsState {
  return { ...state, items: [...state.items, { correction, unsent: true }] };
}

/** Annulla una correzione: se era già sul server, la si cancella anche lì. */
export function withdrawLocal(state: CorrectionsState, id: string): CorrectionsState {
  const item = state.items.find((i) => i.correction.id === id);
  if (!item) return state;
  return {
    items: state.items.filter((i) => i.correction.id !== id),
    withdrawn: item.unsent ? state.withdrawn : [...state.withdrawn, id],
  };
}

/** Esito di una sincronizzazione, da unire allo stato che nel frattempo può essere cambiato. */
export interface SyncOutcome {
  readonly status: 'ok' | 'offline' | 'unauthorized';
  /** Correzioni salvate dal server, per id. */
  readonly saved: ReadonlyMap<string, StoredCorrection>;
  /** Correzioni rifiutate per sempre (forma non valida, lezione non visibile). */
  readonly dropped: ReadonlySet<string>;
  /** Correzioni da reinviare con un id nuovo (id in conflitto). */
  readonly renamed: ReadonlyMap<string, string>;
  /** Annullamenti arrivati al server. */
  readonly deleted: ReadonlySet<string>;
  /** Elenco del server, `null` se non è arrivato. */
  readonly server: readonly StoredCorrection[] | null;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const responseSchema = z.object({ correction: storedCorrectionSchema });
const listSchema = z.object({ corrections: z.array(storedCorrectionSchema) });

/**
 * Invia le correzioni nuove, cancella quelle annullate e scarica l'elenco del
 * server. Si ferma al primo errore di rete: quello che non è partito riparte
 * la volta dopo.
 *
 * @param state - Stato al momento della sincronizzazione.
 * @param fetchImpl - `fetch` (sostituibile nei test).
 * @param newId - Generatore di id per le correzioni in conflitto.
 * @returns L'esito, da unire con {@link mergeSync}.
 */
export async function syncCorrections(
  state: CorrectionsState,
  fetchImpl: Fetch,
  newId: () => string,
): Promise<SyncOutcome> {
  const saved = new Map<string, StoredCorrection>();
  const dropped = new Set<string>();
  const renamed = new Map<string, string>();
  const deleted = new Set<string>();
  const outcome = (status: SyncOutcome['status'], server: StoredCorrection[] | null = null) => ({
    status,
    saved,
    dropped,
    renamed,
    deleted,
    server,
  });
  try {
    for (const { correction, unsent } of state.items) {
      if (!unsent) continue;
      const response = await fetchImpl('/api/corrections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: correction.id,
          subjectId: correction.subjectId,
          correction: correction.correction,
        }),
      });
      if (response.status === 401) return outcome('unauthorized');
      if (response.ok) {
        const parsed = responseSchema.safeParse(await response.json());
        if (parsed.success) saved.set(correction.id, parsed.data.correction);
      } else if (response.status === 409) {
        renamed.set(correction.id, newId());
      } else if (response.status === 400 || response.status === 404) {
        dropped.add(correction.id);
      }
      // Altri errori (500, 429): si riprova la volta dopo.
    }
    for (const id of state.withdrawn) {
      const response = await fetchImpl(`/api/corrections/${id}`, { method: 'DELETE' });
      if (response.status === 401) return outcome('unauthorized');
      if (response.status === 204 || response.status === 404) deleted.add(id);
    }
    const response = await fetchImpl('/api/corrections', { cache: 'no-store' });
    if (response.status === 401) return outcome('unauthorized');
    const list = response.ok ? listSchema.safeParse(await response.json()) : null;
    return outcome('ok', list?.success ? list.data.corrections : null);
  } catch {
    return outcome('offline');
  }
}

/**
 * Unisce l'esito di una sincronizzazione allo stato attuale: tiene le
 * correzioni fatte o annullate mentre la sincronizzazione era in corso.
 *
 * @param state - Stato attuale.
 * @param result - Esito di {@link syncCorrections}.
 * @returns Lo stato nuovo.
 */
export function mergeSync(state: CorrectionsState, result: SyncOutcome): CorrectionsState {
  const present = new Set(state.items.map((item) => item.correction.id));
  // Salvata dal server mentre qui veniva annullata: va cancellata anche lì.
  const late = [...result.saved.keys()].filter((id) => !present.has(id));
  const withdrawn = [...state.withdrawn.filter((id) => !result.deleted.has(id)), ...late];
  const local = state.items
    .filter((item) => !result.dropped.has(item.correction.id))
    .map((item) => {
      const id = item.correction.id;
      const saved = result.saved.get(id);
      if (saved) return { correction: saved, unsent: false };
      const renamed = result.renamed.get(id);
      return renamed ? { ...item, correction: { ...item.correction, id: renamed } } : item;
    });
  if (!result.server) return { items: local, withdrawn };
  // L'elenco del server è la verità per ciò che è già stato inviato (anche da
  // altri dispositivi); restano in più solo le correzioni non ancora inviate.
  const unsent = local.filter((item) => item.unsent);
  const skip = new Set([...withdrawn, ...unsent.map((item) => item.correction.id)]);
  const fromServer = result.server
    .filter((correction) => !skip.has(correction.id))
    .map((correction) => ({ correction, unsent: false }));
  return { items: [...fromServer, ...unsent], withdrawn };
}

/**
 * Correzioni da applicare al feed, in ordine di creazione.
 *
 * @param state - Stato sul dispositivo.
 * @returns Le correzioni.
 */
export function activeCorrections(state: CorrectionsState): StoredCorrection[] {
  return state.items
    .map((item) => item.correction)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
