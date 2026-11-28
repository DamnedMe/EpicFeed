import type { DailyUsage, ProviderId } from '@epicfeed/assistant';
import { PROVIDER_IDS } from '@epicfeed/assistant';

/**
 * Chiave API dell'assistente sul dispositivo (M6, ADR 0021, scelta 0), in un
 * database IndexedDB a parte (`epicfeed-assistant`). La chiave non va mai al
 * server di EpicFeed: la leggono solo le chiamate al fornitore.
 */

const DB_NAME = 'epicfeed-assistant';
const DB_VERSION = 1;
const STATE = 'state';
const SETTINGS = 'settings';
const USAGE = 'usage';

/** Chiave salvata con il fornitore e il modello scelto. */
export interface AssistantSettings {
  readonly provider: ProviderId;
  readonly key: string;
  /** Modello in uso. */
  readonly model: string;
  /** Modelli adatti alla chat che la chiave può usare, per cambiarlo. */
  readonly models: readonly string[];
  readonly savedAt: string;
}

function isSettings(value: unknown): value is AssistantSettings {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    PROVIDER_IDS.includes(record.provider as ProviderId) &&
    typeof record.key === 'string' &&
    typeof record.model === 'string' &&
    Array.isArray(record.models) &&
    record.models.every((model) => typeof model === 'string') &&
    typeof record.savedAt === 'string'
  );
}

function isUsage(value: unknown): value is DailyUsage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.day === 'string' && typeof record.count === 'number';
}

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

/** Chiave e conteggio delle richieste del dispositivo. */
export class AssistantKeyStore {
  /**
   * @param db - Database aperto con {@link openAssistantDb}.
   */
  constructor(private readonly db: IDBDatabase) {}

  private get(name: string): Promise<unknown> {
    return done(this.db.transaction(STATE).objectStore(STATE).get(name));
  }

  private async put(name: string, value: unknown): Promise<void> {
    await done(this.db.transaction(STATE, 'readwrite').objectStore(STATE).put(value, name));
  }

  /** La chiave salvata, se c'è. */
  async load(): Promise<AssistantSettings | null> {
    const value = await this.get(SETTINGS);
    return isSettings(value) ? value : null;
  }

  /** Salva (o sostituisce) la chiave. */
  save(settings: AssistantSettings): Promise<void> {
    return this.put(SETTINGS, settings);
  }

  /** Cancella la chiave dal dispositivo. */
  async remove(): Promise<void> {
    await done(this.db.transaction(STATE, 'readwrite').objectStore(STATE).delete(SETTINGS));
  }

  /** Richieste fatte (ultimo giorno contato). */
  async loadUsage(): Promise<DailyUsage | null> {
    const value = await this.get(USAGE);
    return isUsage(value) ? value : null;
  }

  saveUsage(usage: DailyUsage): Promise<void> {
    return this.put(USAGE, usage);
  }
}

/**
 * Apre (o crea) il database dell'assistente.
 *
 * @param factory - IndexedDB del browser, sostituibile nei test.
 * @returns Il database.
 */
export function openAssistantDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STATE)) {
      request.result.createObjectStore(STATE);
    }
  };
  return done(request);
}

let shared: Promise<AssistantKeyStore | null> | null = null;

/**
 * Deposito della chiave, aperto una volta sola.
 *
 * @returns Il deposito, oppure `null` se IndexedDB non c'è.
 */
export function assistantKeyStore(): Promise<AssistantKeyStore | null> {
  shared ??= (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null;
      return new AssistantKeyStore(await openAssistantDb());
    } catch {
      return null;
    }
  })();
  return shared;
}
