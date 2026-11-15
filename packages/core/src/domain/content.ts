import { DomainError } from './errors.js';
import { normalizeText } from './text.js';

/** Lingue dei riassunti forniti dal portale. */
export type SummaryLanguage = 'it' | 'en';

/**
 * Contenuto testuale di una parte video: i riassunti, fonte principale di
 * schede e quiz (ADR 0006). I sottotitoli non fanno parte della versione:
 * sono tracce separate ({@link SubtitleTrack}), così una traccia aggiunta o
 * corretta non crea una nuova versione della lezione.
 *
 * I riassunti possono mancare (il portale non li ha per ogni video): in quel
 * caso la parte entra solo se porta almeno una traccia di sottotitoli.
 */
export interface VideoPartContent {
  readonly kind: 'video';
  readonly summaries: Readonly<Partial<Record<SummaryLanguage, string>>>;
}

/** Contenuto di una parte da leggere (markdown). */
export interface ReadingPartContent {
  readonly kind: 'reading';
  readonly markdown: string;
}

/** Contenuto importato di una parte di lezione, prima di diventare una versione. */
export type LessonPartContent = VideoPartContent | ReadingPartContent;

/** Limite di sicurezza sulla dimensione di un singolo testo (circa 200 KB). */
export const MAX_TEXT_LENGTH = 200_000;

/**
 * Porta il contenuto nella sua forma canonica: testi normalizzati e riassunti
 * vuoti rimossi.
 *
 * Due import dello stesso materiale producono sempre lo stesso risultato, ed è
 * su questo che si calcola l'impronta (`contentHash`).
 *
 * @param content - Contenuto come arriva dall'import.
 * @returns Il contenuto canonico.
 * @throws {@link DomainError} `INVALID_CONTENT` se un testo è vuoto (lettura)
 *   o troppo grande.
 */
export function normalizeContent(content: LessonPartContent): LessonPartContent {
  return content.kind === 'video' ? normalizeVideo(content) : normalizeReading(content);
}

/**
 * Dice se una parte video ha almeno un riassunto (dopo la normalizzazione).
 *
 * @param content - Contenuto normalizzato.
 * @returns `true` se c'è almeno un riassunto non vuoto.
 */
export function hasSummary(content: VideoPartContent): boolean {
  return Object.keys(content.summaries).length > 0;
}

function normalizeVideo(content: VideoPartContent): VideoPartContent {
  const summaries: Partial<Record<SummaryLanguage, string>> = {};
  for (const language of ['it', 'en'] as const) {
    const raw = content.summaries[language];
    if (raw === undefined) continue;
    const text = limitLength(normalizeText(raw), `Riassunto (${language})`);
    if (text.length > 0) summaries[language] = text;
  }
  return { kind: 'video', summaries };
}

function normalizeReading(content: ReadingPartContent): ReadingPartContent {
  const markdown = limitLength(normalizeText(content.markdown), 'Testo');
  if (markdown.length === 0) {
    throw new DomainError('INVALID_CONTENT', 'Il testo è vuoto');
  }
  return { kind: 'reading', markdown };
}

/**
 * Verifica la lunghezza massima di un testo già normalizzato.
 *
 * @param text - Testo da verificare.
 * @param label - Nome del campo, usato nel messaggio di errore.
 * @returns Il testo stesso.
 * @throws {@link DomainError} `INVALID_CONTENT` se supera {@link MAX_TEXT_LENGTH}.
 */
export function limitLength(text: string, label: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new DomainError('INVALID_CONTENT', `${label} supera la dimensione massima`);
  }
  return text;
}

/**
 * Serializza un valore in JSON con le chiavi in ordine alfabetico, a ogni
 * livello. A differenza di `JSON.stringify`, il risultato non dipende
 * dall'ordine in cui le proprietà sono state create.
 *
 * @param content - Valore già in forma canonica (contenuto o traccia di sottotitoli).
 * @returns La stringa JSON canonica.
 */
export function canonicalJson(content: unknown): string {
  return JSON.stringify(sortKeys(content));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}
