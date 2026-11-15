import { DomainError } from './errors.js';
import { normalizeText } from './text.js';

/** Lingue dei riassunti forniti dal portale. */
export type SummaryLanguage = 'it' | 'en';

/**
 * Riga dei sottotitoli. I tempi sono in millisecondi interi, così il
 * confronto e l'impronta non dipendono da arrotondamenti dei decimali.
 */
export interface SubtitleCue {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

/**
 * Contenuto testuale di una parte video: riassunti (fonte principale) e
 * sottotitoli (solo per i tempi e qualche dettaglio, ADR 0006).
 */
export interface VideoPartContent {
  readonly kind: 'video';
  readonly summaries: Readonly<Partial<Record<SummaryLanguage, string>>>;
  readonly subtitles: readonly SubtitleCue[];
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
/** Limite di sicurezza sul numero di righe di sottotitoli (circa 6 ore di video). */
export const MAX_SUBTITLE_CUES = 10_000;

/**
 * Porta il contenuto nella sua forma canonica: testi normalizzati, riassunti
 * vuoti rimossi, sottotitoli ordinati per tempo e senza righe vuote.
 *
 * Due import dello stesso materiale producono sempre lo stesso risultato, ed è
 * su questo che si calcola l'impronta (`contentHash`).
 *
 * @param content - Contenuto come arriva dall'import.
 * @returns Il contenuto canonico.
 * @throws {@link DomainError} `INVALID_CONTENT` se il contenuto è vuoto, troppo
 *   grande o ha tempi dei sottotitoli non validi.
 */
export function normalizeContent(content: LessonPartContent): LessonPartContent {
  return content.kind === 'video' ? normalizeVideo(content) : normalizeReading(content);
}

function normalizeVideo(content: VideoPartContent): VideoPartContent {
  const summaries: Partial<Record<SummaryLanguage, string>> = {};
  for (const language of ['it', 'en'] as const) {
    const raw = content.summaries[language];
    if (raw === undefined) continue;
    const text = limitLength(normalizeText(raw), `Riassunto (${language})`);
    if (text.length > 0) summaries[language] = text;
  }

  if (content.subtitles.length > MAX_SUBTITLE_CUES) {
    throw new DomainError('INVALID_CONTENT', 'Troppe righe di sottotitoli');
  }
  const subtitles = content.subtitles
    .map(normalizeCue)
    .filter((cue) => cue.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (Object.keys(summaries).length === 0 && subtitles.length === 0) {
    throw new DomainError('INVALID_CONTENT', 'La parte video non ha né riassunti né sottotitoli');
  }
  return { kind: 'video', summaries, subtitles };
}

function normalizeReading(content: ReadingPartContent): ReadingPartContent {
  const markdown = limitLength(normalizeText(content.markdown), 'Testo');
  if (markdown.length === 0) {
    throw new DomainError('INVALID_CONTENT', 'Il testo è vuoto');
  }
  return { kind: 'reading', markdown };
}

function normalizeCue(cue: SubtitleCue): SubtitleCue {
  const { startMs, endMs } = cue;
  if (
    !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) ||
    startMs < 0 ||
    endMs < startMs
  ) {
    throw new DomainError('INVALID_CONTENT', 'Tempi dei sottotitoli non validi');
  }
  // Nei sottotitoli gli a capo sono solo impaginazione: li uniamo in una riga.
  const text = limitLength(normalizeText(cue.text).replace(/\s*\n\s*/g, ' '), 'Sottotitolo');
  return { startMs, endMs, text };
}

function limitLength(text: string, label: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new DomainError('INVALID_CONTENT', `${label} supera la dimensione massima`);
  }
  return text;
}

/**
 * Serializza un contenuto in JSON con le chiavi in ordine alfabetico, a ogni
 * livello. A differenza di `JSON.stringify`, il risultato non dipende
 * dall'ordine in cui le proprietà sono state create.
 *
 * @param content - Contenuto, di norma già passato da {@link normalizeContent}.
 * @returns La stringa JSON canonica.
 */
export function canonicalJson(content: LessonPartContent): string {
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
