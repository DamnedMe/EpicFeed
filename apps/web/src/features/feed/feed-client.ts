import type { StudySubjectsResponse } from '@study-feed/contracts';
import { studySubjectsResponseSchema, subjectFeedResponseSchema } from '@study-feed/contracts';
import type { SubjectFeed } from './model';
import type { KeyValueStore } from './storage';
import { readValue, STORAGE_KEYS, writeValue } from './storage';
import { z } from 'zod';

/**
 * Scaricamento della materia dalla web app (ADR 0015, punto 6).
 *
 * La materia intera si tiene sul dispositivo: si mostra subito la copia
 * salvata e si chiede al server se è cambiata (`If-None-Match`); una materia
 * invariata costa una risposta `304` vuota. Senza rete resta la copia salvata.
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
 * Carica la materia da studiare, usando e aggiornando la copia sul dispositivo.
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
  const preferred =
    requestedSubject ??
    readValue(STORAGE_KEYS.subject, subjectIdSchema, null as string | null, store);
  const cachedFor = (subjectId: string) =>
    readValue(
      STORAGE_KEYS.feed(subjectId),
      subjectFeedResponseSchema,
      null as SubjectFeed | null,
      store,
    );

  let subjects: readonly StudySubjectSummary[];
  try {
    const response = await fetchImpl('/api/feed/subjects', { cache: 'no-store' });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    subjects = studySubjectsResponseSchema.parse(await response.json()).subjects;
  } catch {
    // Senza rete: si studia l'ultima materia salvata, se c'è.
    const cached = preferred ? cachedFor(preferred) : null;
    return cached
      ? { status: 'ready', subjects: [], feed: cached, offline: true }
      : { status: 'error' };
  }

  const subject = chooseSubject(subjects, preferred);
  if (!subject) return { status: 'empty', subjects };
  writeValue(STORAGE_KEYS.subject, subject.subjectId, store);
  const cached = cachedFor(subject.subjectId);

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
    writeValue(STORAGE_KEYS.feed(subject.subjectId), feed, store);
    return { status: 'ready', subjects, feed, offline: false };
  } catch {
    return cached
      ? { status: 'ready', subjects, feed: cached, offline: true }
      : { status: 'error' };
  }
}
