/**
 * Chiave della sincronizzazione sul dispositivo (M4, ADR 0018), in un database
 * IndexedDB a parte (`epicfeed-sync`).
 *
 * La chiave è un `CryptoKey` **non estraibile**: IndexedDB la conserva così
 * com'è (clonazione strutturata) e nessuno script può leggerne i byte.
 * Accanto c'è il *proprietario* dei progressi del dispositivo, per non unire i
 * progressi di due account che usano lo stesso browser.
 */

const DB_NAME = 'epicfeed-sync';
const DB_VERSION = 1;
const STATE = 'state';
const KEY = 'key';
const OWNER = 'owner';

/** Chiave della password salvata sul dispositivo. */
export interface SyncKeyRecord {
  readonly key: CryptoKey;
  /** Email da cui nasce il sale (normalizzata). */
  readonly email: string;
  /** Account a cui appartiene; `null` finché la prima sincronizzazione non lo lega. */
  readonly account: string | null;
  /**
   * `true` se la password è stata appena verificata dal server (accesso,
   * nuova password, sblocco): una copia sul server che non si decifra si può
   * rifare da questo dispositivo. Torna `false` dopo la prima sincronizzazione.
   */
  readonly trusted: boolean;
}

function isRecord(value: unknown): value is SyncKeyRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof CryptoKey !== 'undefined' &&
    record.key instanceof CryptoKey &&
    typeof record.email === 'string' &&
    (record.account === null || typeof record.account === 'string') &&
    typeof record.trusted === 'boolean'
  );
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

/** Chiave e proprietario dei progressi del dispositivo. */
export class SyncKeyStore {
  /**
   * @param db - Database aperto con {@link openSyncDb}.
   */
  constructor(private readonly db: IDBDatabase) {}

  private async get(name: string): Promise<unknown> {
    return done(this.db.transaction(STATE).objectStore(STATE).get(name));
  }

  private async put(name: string, value: unknown): Promise<void> {
    await done(this.db.transaction(STATE, 'readwrite').objectStore(STATE).put(value, name));
  }

  /** La chiave, se c'è ed è valida. */
  async loadKey(): Promise<SyncKeyRecord | null> {
    const value = await this.get(KEY);
    return isRecord(value) ? value : null;
  }

  /** Salva (o sostituisce) la chiave. */
  saveKey(record: SyncKeyRecord): Promise<void> {
    return this.put(KEY, record);
  }

  /** Cancella la chiave (la sincronizzazione chiederà di nuovo la password). */
  async clearKey(): Promise<void> {
    await done(this.db.transaction(STATE, 'readwrite').objectStore(STATE).delete(KEY));
  }

  /** Account proprietario dei progressi del dispositivo, se noto. */
  async loadOwner(): Promise<string | null> {
    const value = await this.get(OWNER);
    return typeof value === 'string' ? value : null;
  }

  saveOwner(account: string): Promise<void> {
    return this.put(OWNER, account);
  }
}

/**
 * Apre (o crea) il database della chiave.
 *
 * @param factory - IndexedDB del browser, sostituibile nei test.
 * @returns Il database.
 */
export function openSyncDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STATE)) {
      request.result.createObjectStore(STATE);
    }
  };
  return done(request);
}

let shared: Promise<SyncKeyStore | null> | null = null;

/**
 * Chiave del dispositivo, aperta una volta sola.
 *
 * @returns Il deposito, oppure `null` se IndexedDB non c'è.
 */
export function syncKeyStore(): Promise<SyncKeyStore | null> {
  shared ??= (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null;
      return new SyncKeyStore(await openSyncDb());
    } catch {
      return null;
    }
  })();
  return shared;
}
