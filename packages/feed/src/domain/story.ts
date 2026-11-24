import type { CardKind, CodeSnippet, Comparison, StudyLanguage } from './feed.js';

/**
 * Schede raccontate a battute (ADR 0015, punto 1).
 *
 * Una scheda generata in M2 diventa una piccola storia: una frase grande per
 * schermata, con le frasi già lette attenuate sopra. Tutto si ricava dai campi
 * già salvati, senza rigenerare nulla: qui stanno solo regole pure su testo e
 * codice, usate dalla web app per disegnare il feed.
 */

/** Campi di una scheda che servono al racconto (senza id con marchio, così vale anche per i dati dell'API). */
export interface StoryCardInput {
  readonly kind: CardKind;
  readonly title: { readonly [L in StudyLanguage]: string };
  readonly keyPoint: { readonly [L in StudyLanguage]: string };
  readonly body: { readonly [L in StudyLanguage]: string };
  readonly steps?: { readonly [L in StudyLanguage]: readonly string[] } | undefined;
  readonly comparison?: Comparison | undefined;
  readonly code?: CodeSnippet | undefined;
  readonly terms: readonly string[];
}

/** Intervallo di caratteri `[start, end)` in un testo. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** Intervallo di righe di codice, estremi compresi, contati da 0. */
export interface LineRange {
  readonly from: number;
  readonly to: number;
}

/** Riga di un confronto, già nella lingua scelta. */
export interface StoryRow {
  readonly aspect: string;
  readonly left: string;
  readonly right: string;
}

/** Frase che spiega il codice, con le righe da illuminare (`null` se nessun abbinamento è sicuro). */
export interface CodeExplanation {
  readonly text: string;
  readonly lines: readonly LineRange[] | null;
}

/**
 * Una battuta: una schermata del racconto. Gli indici puntano agli elenchi di
 * {@link CardStory} (`lines`, `steps`, `rows`, `explanations`).
 */
export type StoryBeat =
  | { readonly kind: 'title' }
  | { readonly kind: 'key' }
  | { readonly kind: 'line'; readonly index: number }
  | { readonly kind: 'step'; readonly index: number }
  | { readonly kind: 'row'; readonly index: number }
  | { readonly kind: 'note' }
  | { readonly kind: 'code'; readonly index: number };

/** Scheda pronta da raccontare in una lingua. */
export interface CardStory {
  readonly kind: CardKind;
  readonly language: StudyLanguage;
  readonly title: string;
  readonly keyPoint: string;
  /** Parola da indovinare nella frase chiave, `null` se non se ne trova una adatta. */
  readonly blank: TextRange | null;
  /** Frasi della spiegazione (*concept*), oppure il contesto sotto la frase chiave (*steps*). */
  readonly lines: readonly string[];
  readonly steps: readonly string[];
  /** Le due idee del duello (*comparison*). */
  readonly duel: { readonly left: string; readonly right: string } | null;
  readonly rows: readonly StoryRow[];
  /** Nota finale di un confronto (la spiegazione), vuota se manca. */
  readonly note: string;
  readonly code: { readonly language: string; readonly lines: readonly string[] } | null;
  readonly explanations: readonly CodeExplanation[];
  readonly beats: readonly StoryBeat[];
}

/** Sotto questa lunghezza una frase si unisce alla precedente: una battuta troppo corta spezza il ritmo. */
const MIN_SENTENCE = 32;

/** Abbreviazioni dopo cui il punto non chiude la frase. */
const ABBREVIATIONS = /(?:\b(?:es|ecc|cfr|vs|ad es|e\.g|i\.e|etc|approx|fig|p))\.$/i;

/**
 * Divide un testo in frasi per le battute.
 *
 * Una frase finisce con `.`, `!`, `?`, `;` o `:` seguiti da uno spazio e da una
 * maiuscola, una cifra o un'apertura (virgolette, parentesi): così `O(1). Poi`
 * si divide, `3.5` e `cursor.next` no. Le abbreviazioni (`es.`, `e.g.`) non
 * chiudono la frase e i pezzi troppo corti si uniscono al precedente.
 *
 * @param text - Testo della spiegazione.
 * @returns Le frasi, senza spazi ai bordi (vuoto se il testo è vuoto).
 */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return [];
  const pieces: string[] = [];
  let start = 0;
  const boundary = /[.!?;:](?=\s+["'«([]?[\p{Lu}\d])/gu;
  for (let match = boundary.exec(clean); match; match = boundary.exec(clean)) {
    const end = match.index + 1;
    const candidate = clean.slice(start, end);
    if (ABBREVIATIONS.test(candidate)) continue;
    pieces.push(candidate.trim());
    start = end;
  }
  pieces.push(clean.slice(start).trim());

  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged.length - 1;
    if (last >= 0 && (piece.length < MIN_SENTENCE || (merged[last] ?? '').length < MIN_SENTENCE)) {
      merged[last] = `${merged[last]} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

const LETTER = /[\p{L}\p{N}_]/u;

/** Tutte le occorrenze di `needle` in `text` come parola intera, senza distinguere maiuscole. */
function findWord(text: string, needle: string): TextRange[] {
  const ranges: TextRange[] = [];
  if (needle.length === 0) return ranges;
  const haystack = text.toLocaleLowerCase('en');
  const target = needle.toLocaleLowerCase('en');
  for (let at = haystack.indexOf(target); at >= 0; at = haystack.indexOf(target, at + 1)) {
    const end = at + target.length;
    const before = at === 0 ? '' : (text[at - 1] ?? '');
    const after = text[end] ?? '';
    // Parola intera: niente lettere attaccate (ma un termine può iniziare o finire con simboli, es. `O(1)`).
    const startsWord = !LETTER.test(target[0] ?? '') || !LETTER.test(before);
    const endsWord = !LETTER.test(target[target.length - 1] ?? '') || !LETTER.test(after);
    if (startsWord && endsWord) ranges.push({ start: at, end });
  }
  return ranges;
}

/** Valori da indovinare quando nessun termine del glossario compare: complessità, codice e numeri. */
const FALLBACK_BLANKS = [
  /O\([^()]{1,12}\)/u,
  /\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+\b/u,
  /(?<![\p{L}\d.,])\d{2,}(?![\d\p{L}])/u,
];

/**
 * Sceglie la parola da coprire nella frase chiave (la *parola da indovinare*).
 *
 * Preferisce il termine del glossario della scheda più lungo che compare come
 * parola intera (i termini sono in inglese, la forma del corso, e spesso
 * restano tali anche nel testo italiano). Se nessuno compare ripiega su una
 * complessità (`O(log N)`), su un pezzo di codice (`cur.next`) o su un numero
 * di almeno due cifre. Non copre mai
 * quasi tutta la frase, altrimenti non resterebbe nulla da cui ricordarla.
 *
 * @param keyPoint - Frase chiave nella lingua scelta.
 * @param terms - Termini della scheda.
 * @returns L'intervallo da coprire, oppure `null`.
 */
export function pickBlank(keyPoint: string, terms: readonly string[]): TextRange | null {
  const fits = (range: TextRange) =>
    range.end - range.start >= 2 && range.end - range.start <= keyPoint.length * 0.6;
  const byLength = [...terms].sort((a, b) => b.length - a.length);
  for (const term of byLength) {
    const range = findWord(keyPoint, term.trim()).find(fits);
    if (range) return range;
  }
  for (const pattern of FALLBACK_BLANKS) {
    const match = pattern.exec(keyPoint);
    if (match) {
      const range = { start: match.index, end: match.index + match[0].length };
      if (fits(range)) return range;
    }
  }
  return null;
}

/**
 * Parti di un testo con i termini evidenziati (in grassetto nel feed).
 *
 * @param text - Testo da dividere.
 * @param terms - Termini da evidenziare (come parole intere, senza distinguere maiuscole).
 * @returns I pezzi in ordine; `term` è vero per i pezzi evidenziati.
 */
export function highlightTerms(
  text: string,
  terms: readonly string[],
): { text: string; term: boolean }[] {
  const ranges = terms
    .flatMap((term) => findWord(text, term.trim()))
    // A parità di inizio vince il termine più lungo; poi si scartano le sovrapposizioni.
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: { text: string; term: boolean }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), term: false });
    parts.push({ text: text.slice(range.start, range.end), term: true });
    cursor = range.end;
  }
  if (cursor < text.length || parts.length === 0) {
    parts.push({ text: text.slice(cursor), term: false });
  }
  return parts;
}

/**
 * Blocchi di un frammento di codice: le righe separate da righe vuote, come le
 * scrive chi spiega (una funzione, un ciclo, una fase dell'algoritmo).
 *
 * @param lines - Righe del codice.
 * @returns Gli intervalli dei blocchi, senza le righe vuote.
 */
export function codeBlocks(lines: readonly string[]): LineRange[] {
  const blocks: LineRange[] = [];
  let from = -1;
  lines.forEach((line, index) => {
    const blank = line.trim().length === 0;
    if (!blank && from < 0) from = index;
    if (blank && from >= 0) {
      blocks.push({ from, to: index - 1 });
      from = -1;
    }
  });
  if (from >= 0) blocks.push({ from, to: lines.length - 1 });
  return blocks;
}

/** Parole chiave e nomi troppo comuni per dire quale parte del codice spiega una frase. */
const CODE_STOPWORDS = new Set([
  'and',
  'break',
  'case',
  'class',
  'const',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'false',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'int',
  'is',
  'let',
  'new',
  'none',
  'not',
  'null',
  'or',
  'pass',
  'print',
  'public',
  'raise',
  'return',
  'self',
  'static',
  'this',
  'true',
  'var',
  'void',
  'while',
  'with',
  'the',
  'una',
  'uno',
  'per',
  'con',
  'che',
  'non',
]);

/** Identificatori significativi di un testo (minuscoli). */
function identifiers(text: string): Set<string> {
  const found = new Set<string>();
  for (const [token] of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const word = token.toLowerCase();
    if (word.length >= 3 && !CODE_STOPWORDS.has(word)) found.add(word);
  }
  return found;
}

/** Fonde intervalli di righe adiacenti o sovrapposti. */
function mergeRanges(ranges: LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const merged: LineRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) {
      merged[merged.length - 1] = { from: last.from, to: Math.max(last.to, range.to) };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/**
 * Abbina ogni frase della spiegazione alle righe di codice di cui parla, in
 * base ai nomi in comune (`merge_sort`, `left_half`, `enqueue`...).
 *
 * Con più blocchi si illumina il blocco (o i blocchi a pari merito) con più
 * nomi in comune; con un blocco solo si illuminano le righe che contengono un
 * nome citato. Una frase senza nomi in comune non illumina nulla: meglio
 * nessuna evidenza che una sbagliata. In M4 la generazione potrà indicare le
 * righe esplicitamente (ADR 0015, Conseguenze).
 *
 * @param lines - Righe del codice.
 * @param sentences - Frasi della spiegazione.
 * @returns Una spiegazione per frase, nello stesso ordine.
 */
export function pairCodeExplanation(
  lines: readonly string[],
  sentences: readonly string[],
): CodeExplanation[] {
  const blocks = codeBlocks(lines);
  const units =
    blocks.length > 1
      ? blocks
      : lines.flatMap((line, index) => (line.trim() ? [{ from: index, to: index }] : []));
  const unitIds = units.map((unit) => identifiers(lines.slice(unit.from, unit.to + 1).join('\n')));

  return sentences.map((text) => {
    const wanted = identifiers(text);
    const scores = unitIds.map((ids) => [...wanted].filter((word) => ids.has(word)).length);
    const best = Math.max(0, ...scores);
    if (best === 0) return { text, lines: null };
    const chosen = units.filter((_, index) =>
      blocks.length > 1 ? scores[index] === best : (scores[index] ?? 0) > 0,
    );
    return { text, lines: mergeRanges(chosen) };
  });
}

/**
 * Racconta una scheda a battute in una lingua.
 *
 * - *concept*: titolo, frase chiave, una frase della spiegazione per battuta;
 * - *steps*: titolo, frase chiave (con la spiegazione come contesto), un passo per battuta;
 * - *comparison*: duello e titolo, frase chiave, una riga per battuta, la spiegazione come nota;
 * - *code*: titolo, frase chiave, una frase per battuta con le righe illuminate.
 *
 * @param card - Scheda salvata.
 * @param language - Lingua di studio.
 * @returns La storia con le battute in ordine (sempre almeno titolo e frase chiave).
 */
export function storyOf(card: StoryCardInput, language: StudyLanguage): CardStory {
  const keyPoint = card.keyPoint[language];
  const body = splitSentences(card.body[language]);
  const steps = card.kind === 'steps' ? [...(card.steps?.[language] ?? [])] : [];
  const comparison = card.kind === 'comparison' ? card.comparison : undefined;
  const rows = (comparison?.rows ?? []).map((row) => ({
    aspect: row.aspect[language],
    left: row.left[language],
    right: row.right[language],
  }));
  const codeLines = card.kind === 'code' && card.code ? card.code.source.split('\n') : null;
  const explanations = codeLines ? pairCodeExplanation(codeLines, body) : [];

  const beats: StoryBeat[] = [{ kind: 'title' }, { kind: 'key' }];
  let lines: string[] = [];
  let note = '';
  switch (card.kind) {
    case 'concept':
      lines = body;
      lines.forEach((_, index) => beats.push({ kind: 'line', index }));
      break;
    case 'steps':
      lines = body;
      steps.forEach((_, index) => beats.push({ kind: 'step', index }));
      break;
    case 'comparison':
      rows.forEach((_, index) => beats.push({ kind: 'row', index }));
      note = card.body[language].trim();
      if (note) beats.push({ kind: 'note' });
      break;
    case 'code':
      explanations.forEach((_, index) => beats.push({ kind: 'code', index }));
      break;
  }

  return {
    kind: card.kind,
    language,
    title: card.title[language],
    keyPoint,
    blank: pickBlank(keyPoint, card.terms),
    lines,
    steps,
    duel: comparison
      ? { left: comparison.left[language], right: comparison.right[language] }
      : null,
    rows,
    note,
    code: codeLines && card.code ? { language: card.code.language, lines: codeLines } : null,
    explanations,
    beats,
  };
}

/** Velocità di lettura per l'avanzamento automatico: circa 200 parole al minuto, con un minimo per battuta. */
const AUTO_MS_PER_CHAR = 55;
const AUTO_MIN_MS = 2200;

/**
 * Tempo di una battuta in modalità automatica.
 *
 * @param text - Testo nuovo della battuta.
 * @returns Millisecondi prima di passare alla battuta successiva.
 */
export function autoAdvanceMs(text: string): number {
  return Math.max(AUTO_MIN_MS, text.length * AUTO_MS_PER_CHAR);
}

/**
 * Testo nuovo di una battuta: quello da leggere ad alta voce (*Ascolta*) e da
 * cui si calcola il tempo dell'avanzamento automatico.
 *
 * @param story - Storia della scheda.
 * @param beat - Battuta.
 * @returns Il testo della battuta.
 */
export function beatText(story: CardStory, beat: StoryBeat): string {
  switch (beat.kind) {
    case 'title':
      return story.duel ? `${story.duel.left} vs ${story.duel.right}. ${story.title}` : story.title;
    case 'key':
      return story.keyPoint;
    case 'line':
      return story.lines[beat.index] ?? '';
    case 'step':
      return story.steps[beat.index] ?? '';
    case 'row': {
      const row = story.rows[beat.index];
      return row ? `${row.aspect}: ${row.left}; ${row.right}` : '';
    }
    case 'note':
      return story.note;
    case 'code':
      return story.explanations[beat.index]?.text ?? '';
  }
}
