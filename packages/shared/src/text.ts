import { DomainError } from './errors.js';

/**
 * Normalizza un testo prima di confrontarlo o di calcolarne l'impronta.
 *
 * Regole, scelte perché differenze invisibili non producano versioni diverse
 * dello stesso contenuto:
 * - forma Unicode NFC (lettere accentate composte in un solo modo);
 * - fine riga `\n` (niente `\r\n` di Windows);
 * - spazi in coda a ogni riga rimossi, tab e spazi non separabili trattati come spazi;
 * - al massimo una riga vuota consecutiva;
 * - spazi iniziali e finali dell'intero testo rimossi.
 *
 * L'indentazione a inizio riga resta, perché nel markdown e nel codice conta.
 *
 * @param input - Testo grezzo.
 * @returns Il testo normalizzato (eventualmente vuoto).
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\t]/g, ' ')
    .replace(/[ ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalizza un testo breve su una riga (titoli, nomi), compattando gli spazi.
 *
 * @param input - Testo grezzo.
 * @param label - Nome del campo, usato nel messaggio di errore.
 * @param maxLength - Lunghezza massima ammessa dopo la normalizzazione.
 * @returns Il testo normalizzato, mai vuoto.
 * @throws {@link DomainError} `INVALID_TEXT` se vuoto o troppo lungo.
 */
export function requireTitle(input: string, label: string, maxLength = 300): string {
  const value = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (value.length === 0) {
    throw new DomainError('INVALID_TEXT', `${label} non può essere vuoto`);
  }
  if (value.length > maxLength) {
    throw new DomainError('INVALID_TEXT', `${label} supera ${maxLength} caratteri`);
  }
  return value;
}

/**
 * Verifica che una posizione nell'ordinamento sia un intero non negativo.
 *
 * @param position - Posizione da verificare.
 * @param label - Nome del campo, usato nel messaggio di errore.
 * @returns La posizione stessa.
 * @throws {@link DomainError} `INVALID_POSITION` se non è un intero ≥ 0.
 */
export function requirePosition(position: number, label: string): number {
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new DomainError('INVALID_POSITION', `${label} deve essere un intero non negativo`);
  }
  return position;
}
