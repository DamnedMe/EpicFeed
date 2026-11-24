import { vi } from 'vitest';
import type { GenerationAccessDeps } from './generation-api';

/**
 * Dati e richieste di prova comuni ai test degli handler della generazione
 * (`features/feed/api` e `features/exam/api`). Solo per i test.
 */

/** Utente del token di prova. */
export const user = '0a0a0a0a-0000-4000-8000-00000000000a';
/** Token "genera" valido. */
export const token = `sfg_${'A'.repeat(43)}`;
/** Lezione di prova. */
export const lessonId = '10000000-0000-4000-8000-000000000001';
/** Parte di lezione di prova. */
export const partId = '20000000-0000-4000-8000-000000000001';

/**
 * Testo nelle due lingue di studio.
 *
 * @param it - Testo italiano.
 * @param en - Testo inglese.
 * @returns L'oggetto bilingue.
 */
export const bi = (it: string, en: string) => ({ it, en });

/** Registrazioni del limite di frequenza fatte dagli handler. */
export const record = vi.fn(() => Promise.resolve());
/** Errori inattesi registrati dagli handler. */
export const logError = vi.fn();

/**
 * Dipendenze comuni: accetta solo {@link token}, sempre sotto il limite.
 * Azzera le chiamate registrate in {@link record} e {@link logError}.
 *
 * @returns Le dipendenze di prova.
 */
export function accessDeps(): GenerationAccessDeps {
  record.mockClear();
  logError.mockClear();
  return {
    verifyToken: (t) => Promise.resolve(t === token ? user : null),
    isAllowed: () => Promise.resolve(true),
    record,
    logError,
  };
}

/**
 * Richiesta all'API della generazione con il token nell'header.
 *
 * @param path - Percorso della richiesta.
 * @param init - Opzioni della richiesta.
 * @param auth - Token da usare.
 * @returns La richiesta.
 */
export function request(path: string, init: RequestInit = {}, auth = token): Request {
  return new Request(`https://app.test${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${auth}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/**
 * Errore nel corpo di una risposta.
 *
 * @param response - Risposta dell'handler.
 * @returns Codice e problemi dell'errore.
 */
export async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; issues?: { path: string }[] } })
    .error;
}
