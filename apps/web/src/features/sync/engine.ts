'use client';

import { syncProgress } from '@epicfeed/review';
import { setDeviceFlag, SYNC_KEY_COOKIE } from '../device-flags';
import { useEffect, useSyncExternalStore } from 'react';
import { notifyProgress, onProgress, progressStore } from '../review/progress-store';
import { derivePasswordKey, normalizeEmail } from './crypto';
import { syncKeyStore } from './key-store';
import { HttpProgressVault, SyncHttpError } from './vault';

/**
 * Motore della sincronizzazione dei progressi (M4, ADR 0018): quando
 * sincronizzare, con quale chiave, e lo stato da mostrare.
 *
 * Si sincronizza all'apertura del feed e del ripasso, 20 secondi dopo
 * l'ultima risposta, quando l'app va in secondo piano e quando torna la rete.
 * Una sincronizzazione alla volta: le richieste nel frattempo si accodano in
 * una sola.
 */

/** Stato della sincronizzazione. */
export type SyncStatus =
  /** IndexedDB non disponibile (navigazione privata): niente da sincronizzare. */
  | { readonly state: 'off' }
  | { readonly state: 'idle' }
  | { readonly state: 'syncing' }
  | { readonly state: 'synced'; readonly at: string }
  /** Manca la chiave su questo dispositivo: serve la password. */
  | { readonly state: 'nokey' }
  /** La copia sul server è cifrata con un'altra password: serve quella nuova. */
  | { readonly state: 'locked' }
  | { readonly state: 'offline' }
  | { readonly state: 'error' };

/** Attesa dopo l'ultima risposta prima di sincronizzare. */
export const SYNC_DEBOUNCE_MS = 20_000;

let status: SyncStatus = { state: 'idle' };
const listeners = new Set<() => void>();
let running: Promise<SyncStatus> | null = null;
let queued: string | null = null;
/** `true` mentre la sincronizzazione stessa avvisa dei progressi cambiati. */
let applyingRemote = false;

function setStatus(next: SyncStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

/** Stato attuale (per i test e per React). */
export function currentSyncStatus(): SyncStatus {
  return status;
}

/** Una sincronizzazione completa per `account`. */
async function syncOnce(account: string): Promise<SyncStatus> {
  const [store, keys] = await Promise.all([progressStore(), syncKeyStore()]);
  if (!store || !keys) return { state: 'off' };

  // Progressi di un altro account sullo stesso browser: non si uniscono.
  const owner = await keys.loadOwner();
  if (owner !== account) {
    if (owner !== null) {
      await store.clear();
      await keys.clearKey();
      notifyLocal();
    }
    await keys.saveOwner(account);
  }

  let record = await keys.loadKey();
  if (record?.account && record.account !== account) {
    await keys.clearKey();
    record = null;
  }
  // Il server lo legge per disegnare subito il Ripasso giusto (con o senza password).
  setDeviceFlag(SYNC_KEY_COOKIE, record !== null);
  if (!record) return { state: 'nokey' };
  if (!record.account) {
    record = { ...record, account };
    await keys.saveKey(record);
  }

  try {
    const outcome = await syncProgress(store, new HttpProgressVault(record.key), {
      replaceUnreadable: record.trusted,
    });
    if (outcome.status === 'locked') return { state: 'locked' };
    if (outcome.status === 'busy') return { state: 'error' };
    if (record.trusted) await keys.saveKey({ ...record, trusted: false });
    if (outcome.pulled) notifyLocal();
    return { state: 'synced', at: new Date().toISOString() };
  } catch (error) {
    const offline =
      (error instanceof SyncHttpError && error.status === 0) ||
      (typeof navigator !== 'undefined' && !navigator.onLine);
    return { state: offline ? 'offline' : 'error' };
  }
}

/** Avvisa chi mostra i progressi senza far ripartire la sincronizzazione. */
function notifyLocal(): void {
  applyingRemote = true;
  try {
    notifyProgress();
  } finally {
    applyingRemote = false;
  }
}

/**
 * Sincronizza adesso (o subito dopo quella in corso).
 *
 * @param account - Utente della sessione.
 * @returns Lo stato finale.
 */
export function syncNow(account: string): Promise<SyncStatus> {
  if (running) {
    queued = account;
    return running;
  }
  setStatus({ state: 'syncing' });
  running = syncOnce(account)
    .catch((): SyncStatus => ({ state: 'error' }))
    .then((next) => {
      running = null;
      setStatus(next);
      const again = queued;
      queued = null;
      if (again) void syncNow(again);
      return next;
    });
  return running;
}

/**
 * Prepara la chiave dalla password appena verificata dal server (accesso,
 * nuova password o sblocco). Non lancia mai: senza chiave lo studio continua
 * e il Ripasso chiederà la password.
 *
 * @param email - Email dell'account.
 * @param password - Password.
 * @param account - Utente, se già noto (sblocco); `null` all'accesso.
 * @returns `true` se la chiave è salvata.
 */
export async function rememberPasswordKey(
  email: string,
  password: string,
  account: string | null = null,
): Promise<boolean> {
  try {
    const keys = await syncKeyStore();
    if (!keys || typeof crypto === 'undefined' || !('subtle' in crypto)) return false;
    const key = await derivePasswordKey(email, password);
    await keys.saveKey({ key, email: normalizeEmail(email), account, trusted: true });
    return true;
  } catch {
    return false;
  }
}

/** Dimentica la chiave (accesso fallito o uscita). */
export async function forgetPasswordKey(): Promise<void> {
  try {
    await (await syncKeyStore())?.clearKey();
  } catch {
    // Niente da fare: alla prossima sincronizzazione si richiede la password.
  }
}

/**
 * Tiene sincronizzati i progressi mentre la pagina è aperta.
 *
 * @param account - Utente della sessione.
 */
export function useProgressSync(account: string): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      dirty = false;
      void syncNow(account);
    };
    const stopProgress = onProgress(() => {
      if (applyingRemote) return;
      dirty = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirty) flush();
    };
    const onOnline = () => {
      flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onOnline);
    flush();
    return () => {
      stopProgress();
      if (timer) clearTimeout(timer);
      if (dirty) void syncNow(account);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onOnline);
    };
  }, [account]);
}

/**
 * Stato della sincronizzazione da mostrare.
 *
 * @returns Lo stato, aggiornato a ogni cambio.
 */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => status,
    () => status,
  );
}
