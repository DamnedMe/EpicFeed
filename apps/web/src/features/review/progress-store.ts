import type { AnswerRecord, ConceptReviewState, DayStreak, ProgressStore } from '@study-feed/core';
import { EMPTY_DAY_STREAK } from '@study-feed/core';
import { z } from 'zod';

/**
 * Progressi del ripasso in IndexedDB (M4, ADR 0017): stati FSRS dei concetti,
 * storico delle risposte e serie di giorni. Restano sul dispositivo; dalla
 * PR successiva una copia cifrata sul dispositivo si sincronizza tra telefono
 * e PC.
 *
 * Ogni valore letto passa da uno schema: un record corrotto o scritto da una
 * versione futura viene ignorato invece di rompere il ripasso.
 */

const DB_NAME = 'epicfeed-progress';
const DB_VERSION = 1;
const REVIEWS = 'reviews';
const ANSWERS = 'answers';
const META = 'meta';
const STREAK_KEY = 'dayStreak';

const isoDate = z.string().max(40);

const reviewSchema: z.ZodType<ConceptReviewState> = z.object({
  conceptId: z.string().min(1).max(200),
  due: isoDate,
  stability: z.number().min(0),
  difficulty: z.number().min(0),
  scheduledDays: z.number().min(0),
  learningSteps: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  wrong: z.number().int().min(0),
  phase: z.enum(['new', 'learning', 'review', 'relearning']),
  lastReview: isoDate.nullable(),
  lastGrade: z.enum(['again', 'hard', 'good']).nullable(),
  lastQuestionId: z.string().max(300).nullable(),
});

const streakSchema: z.ZodType<DayStreak> = z.object({
  lastDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  days: z.number().int().min(0),
  best: z.number().int().min(0),
});

/** Promessa di una richiesta IndexedDB. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Richiesta IndexedDB non riuscita'));
    };
  });
}

/** Promessa della fine di una transazione (scritture confermate su disco). */
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Transazione IndexedDB non riuscita'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Transazione IndexedDB annullata'));
    };
  });
}

/**
 * Apre (o crea) il database dei progressi.
 *
 * @param factory - IndexedDB del browser, sostituibile nei test.
 * @returns Il database.
 */
export function openProgressDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(REVIEWS))
      db.createObjectStore(REVIEWS, { keyPath: 'conceptId' });
    if (!db.objectStoreNames.contains(ANSWERS))
      db.createObjectStore(ANSWERS, { autoIncrement: true });
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
  };
  return done(request);
}

/** Progressi in IndexedDB. */
export class IndexedDbProgressStore implements ProgressStore {
  /**
   * @param db - Database aperto con {@link openProgressDb}.
   */
  constructor(private readonly db: IDBDatabase) {}

  /** @inheritdoc */
  async loadReviews(): Promise<ConceptReviewState[]> {
    const rows = await done(this.db.transaction(REVIEWS).objectStore(REVIEWS).getAll());
    return rows.flatMap((row: unknown) => {
      const parsed = reviewSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  }

  /** @inheritdoc */
  async getReview(conceptId: string): Promise<ConceptReviewState | undefined> {
    const row: unknown = await done(
      this.db.transaction(REVIEWS).objectStore(REVIEWS).get(conceptId),
    );
    const parsed = reviewSchema.safeParse(row);
    return parsed.success ? parsed.data : undefined;
  }

  /** @inheritdoc */
  async saveAnswer(state: ConceptReviewState, answer: AnswerRecord): Promise<void> {
    // Stato e risposta nella stessa transazione: o entrambi o nessuno.
    const transaction = this.db.transaction([REVIEWS, ANSWERS], 'readwrite');
    transaction.objectStore(REVIEWS).put(state);
    transaction.objectStore(ANSWERS).add(answer);
    await committed(transaction);
  }

  /** @inheritdoc */
  async loadDayStreak(): Promise<DayStreak> {
    const row: unknown = await done(this.db.transaction(META).objectStore(META).get(STREAK_KEY));
    const parsed = streakSchema.safeParse(row);
    return parsed.success ? parsed.data : EMPTY_DAY_STREAK;
  }

  /** @inheritdoc */
  async saveDayStreak(streak: DayStreak): Promise<void> {
    const transaction = this.db.transaction(META, 'readwrite');
    transaction.objectStore(META).put(streak, STREAK_KEY);
    await committed(transaction);
  }

  /**
   * Numero di risposte registrate (per i riepiloghi e i test).
   *
   * @returns Il conteggio.
   */
  countAnswers(): Promise<number> {
    return done(this.db.transaction(ANSWERS).objectStore(ANSWERS).count());
  }

  /** Cancella tutti i progressi (uscita dall'account). */
  async clear(): Promise<void> {
    const transaction = this.db.transaction([REVIEWS, ANSWERS, META], 'readwrite');
    for (const name of [REVIEWS, ANSWERS, META]) transaction.objectStore(name).clear();
    await committed(transaction);
  }
}

let shared: Promise<IndexedDbProgressStore | null> | null = null;
const listeners = new Set<() => void>();

/**
 * Progressi del dispositivo, aperti una volta sola.
 *
 * @returns I progressi, oppure `null` se IndexedDB non c'è o è bloccato
 *   (navigazione privata su alcuni browser): lo studio continua senza ripasso.
 */
export function progressStore(): Promise<IndexedDbProgressStore | null> {
  shared ??= (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null;
      return new IndexedDbProgressStore(await openProgressDb());
    } catch {
      return null;
    }
  })();
  return shared;
}

/**
 * Avvisa chi mostra i progressi che sono cambiati.
 */
export function notifyProgress(): void {
  for (const listener of listeners) listener();
}

/**
 * Ascolta i cambi dei progressi in questa pagina.
 *
 * @param listener - Funzione da chiamare a ogni cambio.
 * @returns La funzione per smettere di ascoltare.
 */
export function onProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
