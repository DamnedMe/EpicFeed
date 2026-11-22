import type { SlideFile } from './archive.js';

/** Lezione importata, come la restituisce l'API (`/api/generation/catalog`). */
export interface CatalogLesson {
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly chapterTitle: string;
  readonly subjectTitle: string;
}

/** Presentazione abbinata a una lezione. */
export interface MatchedFile {
  readonly number: number;
  readonly file: SlideFile;
}

/** PDF lasciato fuori, con il motivo da mostrare allo studente. */
export interface UnmatchedFile {
  readonly fileName: string;
  readonly reason: string;
}

/** Esito dell'abbinamento. */
export interface MatchResult {
  readonly matched: ReadonlyMap<string, { lesson: CatalogLesson; files: MatchedFile[] }>;
  readonly unmatched: readonly UnmatchedFile[];
}

const FILE_PATTERN = /^(.+?)\s*-\s*(\d{1,2})\.pdf$/i;

/**
 * Legge titolo della lezione e numero della presentazione dal nome del file,
 * nel formato della pagina Course downloads: `{titolo lezione}-{n}.pdf`.
 *
 * @param fileName - Nome del PDF.
 * @returns Titolo e numero, o `null` se il nome non ha quel formato.
 */
export function parseSlideFileName(fileName: string): { title: string; number: number } | null {
  const match = FILE_PATTERN.exec(fileName.trim());
  if (!match?.[1] || !match[2]) return null;
  const number = Number(match[2]);
  return number >= 1 ? { title: match[1], number } : null;
}

/**
 * Forma confrontabile di un titolo: minuscole, senza accenti e senza
 * punteggiatura (i nomi dei file perdono caratteri come `/`, `:` o `?`).
 *
 * @param title - Titolo della lezione o dal nome del file.
 * @returns Le sole lettere e cifre, separate da uno spazio.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Un PDF con il titolo letto dal nome e le lezioni che hanno quel titolo. */
interface ParsedFile {
  readonly file: SlideFile;
  readonly number: number;
  readonly candidates: readonly CatalogLesson[];
}

/**
 * Abbina i PDF alle lezioni importate per titolo (ADR 0012).
 *
 * Più lezioni dello stesso corso possono avere lo stesso titolo (es. due
 * "Examples" in capitoli diversi): lo zip del portale le distingue solo con la
 * numerazione, che prosegue da una lezione all'altra (`Examples-1…3` nel
 * capitolo 2, `Examples-4…6` nel capitolo 4). Per questi file conta l'ordine
 * dello zip, che è quello del corso: vedi {@link resolveByNeighbours}. Le
 * presentazioni di queste lezioni si rinumerano da 1.
 *
 * Un file che non trova una lezione, o non riesce a sceglierne una, resta
 * fuori con il motivo: nessun abbinamento a indovinare.
 *
 * @param files - PDF dello zip, nell'ordine dello zip.
 * @param lessons - Lezioni importate dallo studente, nell'ordine del corso.
 * @param subject - Se indicata, considera solo le materie che la contengono nel titolo.
 * @returns Abbinamenti per lezione e file esclusi.
 */
export function matchSlideFiles(
  files: readonly SlideFile[],
  lessons: readonly CatalogLesson[],
  subject?: string,
): MatchResult {
  const subjectKey = subject === undefined ? '' : normalizeTitle(subject);
  const byTitle = new Map<string, CatalogLesson[]>();
  for (const lesson of lessons) {
    if (subjectKey !== '' && !normalizeTitle(lesson.subjectTitle).includes(subjectKey)) continue;
    const key = normalizeTitle(lesson.lessonTitle);
    byTitle.set(key, [...(byTitle.get(key) ?? []), lesson]);
  }

  const unmatched: (UnmatchedFile & { readonly order: number })[] = [];
  const order = new Map(files.map((file, index) => [file, index]));
  const parsed: ParsedFile[] = [];
  for (const file of files) {
    const name = parseSlideFileName(file.fileName);
    if (!name) {
      unmatched.push({
        fileName: file.fileName,
        reason: 'il nome non è "titolo-numero.pdf"',
        order: order.get(file) ?? 0,
      });
      continue;
    }
    const candidates = byTitle.get(normalizeTitle(name.title)) ?? [];
    if (candidates.length === 0) {
      unmatched.push({
        fileName: file.fileName,
        reason: 'nessuna lezione importata con questo titolo',
        order: order.get(file) ?? 0,
      });
      continue;
    }
    parsed.push({ file, number: name.number, candidates });
  }

  const courseIndex = new Map(lessons.map((lesson, index) => [lesson.lessonId, index]));
  const matched = new Map<string, { lesson: CatalogLesson; files: MatchedFile[] }>();
  const sharedTitle = new Set<string>();
  for (const [index, item] of parsed.entries()) {
    const shared = item.candidates.length > 1;
    const lesson = shared ? resolveByNeighbours(parsed, index, courseIndex) : item.candidates[0];
    if (!lesson) {
      unmatched.push({
        fileName: item.file.fileName,
        reason:
          item.file.archiveOrder === undefined
            ? `${String(item.candidates.length)} lezioni con questo titolo: usa lo zip scaricato dal portale, non la cartella estratta`
            : `${String(item.candidates.length)} lezioni con questo titolo e l'ordine dello zip non basta a scegliere`,
        order: order.get(item.file) ?? 0,
      });
      continue;
    }
    if (shared) sharedTitle.add(lesson.lessonId);
    const entry = matched.get(lesson.lessonId) ?? { lesson, files: [] };
    if (entry.files.some((existing) => existing.number === item.number)) {
      unmatched.push({
        fileName: item.file.fileName,
        reason: 'numero di presentazione ripetuto',
        order: order.get(item.file) ?? 0,
      });
      continue;
    }
    entry.files.push({ number: item.number, file: item.file });
    matched.set(lesson.lessonId, entry);
  }

  for (const [lessonId, entry] of matched) {
    entry.files.sort((a, b) => a.number - b.number);
    if (sharedTitle.has(lessonId)) {
      // La numerazione dello zip prosegue tra lezioni omonime: si riparte da 1.
      entry.files = entry.files.map((deck, rank) => ({ number: rank + 1, file: deck.file }));
    }
  }
  const inFileOrder = unmatched
    .sort((a, b) => a.order - b.order)
    .map(({ fileName, reason }) => ({ fileName, reason }));
  return { matched, unmatched: inFileOrder };
}

/**
 * Sceglie la lezione di un PDF il cui titolo è di più lezioni, guardando i
 * PDF vicini nello zip con un titolo unico (lo zip segue l'ordine del corso):
 *
 * 1. tiene le lezioni che nel corso stanno tra la lezione del vicino
 *    precedente e quella del vicino successivo;
 * 2. se ne restano più di una, tiene quelle nello stesso capitolo del vicino
 *    precedente o, in mancanza, del successivo.
 *
 * @param parsed - PDF con titolo riconosciuto, nell'ordine dello zip.
 * @param index - Posizione del PDF da abbinare in `parsed`.
 * @param courseIndex - Posizione di ogni lezione nel corso.
 * @returns La lezione, o `undefined` se non si può scegliere con certezza
 *   (anche quando i file vengono da una cartella, senza l'ordine dello zip).
 */
function resolveByNeighbours(
  parsed: readonly ParsedFile[],
  index: number,
  courseIndex: ReadonlyMap<string, number>,
): CatalogLesson | undefined {
  const item = parsed[index];
  if (item?.file.archiveOrder === undefined) return undefined;
  const isAnchor = (other: ParsedFile) =>
    other.candidates.length === 1 && other.file.archiveOrder !== undefined;
  const previous = parsed.slice(0, index).findLast(isAnchor)?.candidates[0];
  const next = parsed.slice(index + 1).find(isAnchor)?.candidates[0];
  const position = (lesson: CatalogLesson) => courseIndex.get(lesson.lessonId) ?? -1;
  const low = previous ? position(previous) : -Infinity;
  const high = next ? position(next) : Infinity;

  let candidates = item.candidates.filter(
    (lesson) => low >= high || (position(lesson) > low && position(lesson) < high),
  );
  if (candidates.length > 1) {
    const chapterOf = (lesson: CatalogLesson) =>
      `${lesson.subjectTitle}\u0000${lesson.chapterTitle}`;
    for (const neighbour of [previous, next]) {
      if (!neighbour) continue;
      const sameChapter = candidates.filter((lesson) => chapterOf(lesson) === chapterOf(neighbour));
      if (sameChapter.length > 0) {
        candidates = sameChapter;
        break;
      }
    }
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
