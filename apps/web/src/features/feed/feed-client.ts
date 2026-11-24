import type { StudySubjectsResponse } from '@study-feed/contracts';
import { studySubjectsResponseSchema, subjectFeedResponseSchema } from '@study-feed/contracts';
import { FEED_COPY_COOKIE, setDeviceFlag } from '../device-flags';
import type { SubjectFeed } from './model';
import type { KeyValueStore } from './storage';
import { defaultStore, readValue, STORAGE_KEYS, writeValue } from './storage';
import * as z from 'zod';

/**
 * Scaricamento della materia dalla web app (ADR 0015, punto 6).
 *
 * La materia intera si tiene sul dispositivo: il feed mostra subito la copia
 * salvata e intanto chiede al server se è cambiata (`If-None-Match`); una
 * materia invariata costa una risposta `304` vuota. Senza rete resta la copia.
 */

export type StudySubjectSummary = StudySubjectsResponse['subjects'][number];

/** Esito del caricamento. */
export type FeedLoad =
  | { readonly status: 'unauthorized' }
  | { readonly status: 'empty'; readonly subjects: readonly StudySubjectSummary[] }
  | {
      readonly status: 'ready';
      readonly subjects: readonly StudySubjectSummary[];
      readonly feed: SubjectFeed;
      /** `true` se il server non era raggiungibile e si usa la copia salvata. */
      readonly offline: boolean;
    }
  | { readonly status: 'error' };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const subjectIdSchema = z.uuid();

/**
 * Sceglie la materia da studiare: l'ultima aperta se ha ancora lezioni pronte,
 * altrimenti la prima che ne ha.
 *
 * @param subjects - Materie importate.
 * @param preferred - Ultima materia aperta.
 * @returns La materia, oppure `null` se nessuna ha lezioni generate.
 */
export function chooseSubject(
  subjects: readonly StudySubjectSummary[],
  preferred: string | null,
): StudySubjectSummary | null {
  const ready = subjects.filter((subject) => subject.lessonsWithFeed > 0);
  return ready.find((subject) => subject.subjectId === preferred) ?? ready[0] ?? null;
}

/**
 * Copie della materia già lette e validate, per spazio dei dati. La materia
 * intera pesa centinaia di KB: rileggerla e validarla a ogni ritorno sul feed
 * (per esempio da *Io*) costerebbe decine di millisecondi sul telefono.
 * La `WeakMap` tiene separati gli spazi (anche quelli finti dei test).
 */
const memory = new WeakMap<KeyValueStore, Map<string, SubjectFeed>>();

function resolveStore(store: KeyValueStore | null | undefined): KeyValueStore | null {
  return store === undefined ? defaultStore() : store;
}

function remember(store: KeyValueStore | null, feed: SubjectFeed): void {
  if (!store) return;
  const feeds = memory.get(store) ?? new Map<string, SubjectFeed>();
  feeds.set(feed.subjectId, feed);
  memory.set(store, feeds);
}

/**
 * Materia da aprire: quella chiesta esplicitamente, altrimenti l'ultima aperta.
 *
 * @param store - Spazio dei dati del dispositivo (predefinito `localStorage`).
 * @param requestedSubject - Materia chiesta esplicitamente (per esempio da *Salvati*).
 * @returns L'id della materia, oppure `null`.
 */
export function preferredSubjectId(
  store?: KeyValueStore | null,
  requestedSubject?: string | null,
): string | null {
  return (
    requestedSubject ??
    readValue(STORAGE_KEYS.subject, subjectIdSchema, null as string | null, resolveStore(store))
  );
}

/**
 * Copia della materia sul dispositivo, se c'è e rispetta lo schema: prima
 * dalla memoria, poi da `localStorage`.
 *
 * @param subjectId - Materia.
 * @param store - Spazio dei dati del dispositivo (predefinito `localStorage`).
 * @returns La materia salvata, oppure `null`.
 */
export function readCachedFeed(
  subjectId: string,
  store?: KeyValueStore | null,
): SubjectFeed | null {
  const kv = resolveStore(store);
  const hit = kv ? memory.get(kv)?.get(subjectId) : undefined;
  if (hit) return hit;
  const feed = readValue(
    STORAGE_KEYS.feed(subjectId),
    subjectFeedResponseSchema,
    null as SubjectFeed | null,
    kv,
  );
  if (feed) remember(kv, feed);
  return feed;
}

/**
 * Chiede al server la materia da studiare, usando e aggiornando la copia sul
 * dispositivo. Chi la chiama può mostrare prima la copia ({@link readCachedFeed})
 * e usare questo esito per aggiornarla: lo studio parte senza aspettare la rete.
 *
 * @param fetchImpl - `fetch` (sostituibile nei test).
 * @param store - Spazio dei dati del dispositivo (predefinito `localStorage`).
 * @param requestedSubject - Materia chiesta esplicitamente (per esempio da *Salvati*).
 * @returns L'esito.
 */
export async function loadFeed(
  fetchImpl: Fetch,
  store?: KeyValueStore | null,
  requestedSubject?: string | null,
): Promise<FeedLoad> {
  const kv = resolveStore(store);
  const preferred = preferredSubjectId(kv, requestedSubject);

  let subjects: readonly StudySubjectSummary[];
  try {
    const response = await fetchImpl('/api/feed/subjects', { cache: 'no-store' });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    subjects = studySubjectsResponseSchema.parse(await response.json()).subjects;
  } catch {
    // Senza rete: si studia l'ultima materia salvata, se c'è.
    const cached = preferred ? readCachedFeed(preferred, kv) : null;
    return cached
      ? { status: 'ready', subjects: [], feed: cached, offline: true }
      : { status: 'error' };
  }

  const subject = chooseSubject(subjects, preferred);
  if (!subject) return { status: 'empty', subjects };
  writeValue(STORAGE_KEYS.subject, subject.subjectId, kv);
  const cached = readCachedFeed(subject.subjectId, kv);

  try {
    const response = await fetchImpl(`/api/feed/subjects/${subject.subjectId}`, {
      // Il browser rivaluta comunque (`no-cache`); l'ETag lo mandiamo noi dalla copia salvata.
      cache: 'no-store',
      headers: cached ? { 'If-None-Match': `"${cached.version}"` } : {},
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 304 && cached) {
      return { status: 'ready', subjects, feed: cached, offline: false };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feed = subjectFeedResponseSchema.parse(await response.json());
    if (writeValue(STORAGE_KEYS.feed(subject.subjectId), feed, kv)) rememberFeedCopy();
    remember(kv, feed);
    return { status: 'ready', subjects, feed, offline: false };
  } catch {
    return cached
      ? { status: 'ready', subjects, feed: cached, offline: true }
      : { status: 'error' };
  }
}

/** Segna nel cookie che il dispositivo ha una copia della materia. */
export function rememberFeedCopy(): void {
  setDeviceFlag(FEED_COPY_COOKIE, true);
}
