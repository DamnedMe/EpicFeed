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
  readonly summaries: { readonly [L in SummaryLanguage]?: string | undefined };
}

/** Contenuto di una parte da leggere (markdown). */
export interface ReadingPartContent {
  readonly kind: 'reading';
  readonly markdown: string;
}

/** Una pagina di una presentazione: numero (da 1) e testo estratto sul PC. */
export interface SlidePage {
  readonly number: number;
  readonly text: string;
}

/**
 * Contenuto di una presentazione di slide (ADR 0012): il testo di ogni pagina,
 * estratto sul PC dal PDF dello zip ufficiale. Le immagini e il PDF non
 * arrivano al server. `fileName` è il nome del PDF nello zip, utile allo
 * studente per riconoscerlo.
 */
export interface SlidesPartContent {
  readonly kind: 'slides';
  readonly fileName: string;
  readonly pages: readonly SlidePage[];
}

/** Contenuto importato di una parte di lezione, prima di diventare una versione. */
export type LessonPartContent = VideoPartContent | ReadingPartContent | SlidesPartContent;

/** Massimo di pagine per presentazione (le slide Epicode ne hanno 10–60). */
export const MAX_SLIDE_PAGES = 300;

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
  switch (content.kind) {
    case 'video':
      return normalizeVideo(content);
    case 'reading':
      return normalizeReading(content);
    case 'slides':
      return normalizeSlides(content);
  }
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

function normalizeSlides(content: SlidesPartContent): SlidesPartContent {
  const fileName = normalizeText(content.fileName);
  if (fileName.length === 0 || fileName.length > 255 || fileName.includes('\n')) {
    throw new DomainError('INVALID_CONTENT', 'Nome del file delle slide non valido');
  }
  if (content.pages.length === 0 || content.pages.length > MAX_SLIDE_PAGES) {
    throw new DomainError('INVALID_CONTENT', 'Numero di pagine delle slide non valido');
  }
  const seen = new Set<number>();
  const pages = content.pages.map((page) => {
    if (!Number.isInteger(page.number) || page.number < 1 || seen.has(page.number)) {
      throw new DomainError('INVALID_CONTENT', 'Numero di pagina non valido');
    }
    seen.add(page.number);
    // Una pagina può restare senza testo (solo un diagramma): conta comunque,
    // perché Claude ne riceve l'immagine durante la generazione.
    return { number: page.number, text: normalizeText(page.text) };
  });
  pages.sort((a, b) => a.number - b.number);
  limitLength(pages.map((page) => page.text).join('\n'), 'Testo delle slide');
  return { kind: 'slides', fileName, pages };
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
