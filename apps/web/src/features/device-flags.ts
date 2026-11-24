/**
 * Cookie-segnale del dispositivo: dicono al server, con un solo `1`, cosa c'è
 * già sul dispositivo, così la prima schermata arriva disegnata giusta senza
 * aspettare gli script. Nessun dato di studio passa nei cookie.
 */

/** Il dispositivo ha una copia della materia: il server non manda l'anteprima del feed. */
export const FEED_COPY_COOKIE = 'ef-feed-copy';

/** Il dispositivo ha la chiave della sincronizzazione: il Ripasso non chiede la password. */
export const SYNC_KEY_COOKIE = 'ef-sync-key';

/** Durata dei segnali: un anno. */
const MAX_AGE = 31_536_000;

/**
 * Accende o spegne un segnale del dispositivo. Fuori dal browser non fa niente.
 *
 * @param name - Nome del cookie.
 * @param on - `true` per accenderlo, `false` per toglierlo.
 */
export function setDeviceFlag(name: string, on: boolean): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${on ? '1' : ''}; Path=/; Max-Age=${on ? MAX_AGE : 0}; SameSite=Lax${secure}`;
}
