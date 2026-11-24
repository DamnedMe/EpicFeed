import { DomainError } from './errors.js';

/**
 * Identificatore "marchiato": a runtime è una stringa, ma per il compilatore
 * un `LessonId` non è assegnabile a un `LessonPartId`. Evita di scambiare per
 * errore gli id di entità diverse.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Id interno di un utente (coincide con `auth.users.id` di Supabase). */
export type UserId = Brand<string, 'UserId'>;
/** Id interno di un capitolo. */
export type ChapterId = Brand<string, 'ChapterId'>;
/** Id interno di una lezione. */
export type LessonId = Brand<string, 'LessonId'>;
/** Id interno di una parte di lezione. */
export type LessonPartId = Brand<string, 'LessonPartId'>;
/** Id interno di una versione del contenuto. */
export type ContentVersionId = Brand<string, 'ContentVersionId'>;
/** Id interno di una traccia di sottotitoli. */
export type SubtitleTrackId = Brand<string, 'SubtitleTrackId'>;
/** Id interno di un libro personale (sezione Libri, ADR 0005). */
export type BookId = Brand<string, 'BookId'>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Valida un UUID e lo restituisce come id marchiato.
 *
 * @param value - Stringa da validare; maiuscole ammesse, il risultato è minuscolo.
 * @param label - Nome del campo, usato nel messaggio di errore.
 * @returns L'id normalizzato in minuscolo.
 * @throws {@link DomainError} `INVALID_ID` se la stringa non è un UUID.
 */
export function parseId<B extends string>(value: string, label: B): Brand<string, B> {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new DomainError('INVALID_ID', `${label} non è un UUID valido`);
  }
  return normalized as Brand<string, B>;
}
