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
 * Dice se un PDF è materiale d'esame del corso (es. `Exam Prep-1.pdf`) invece
 * delle slide di una lezione: va alla banca degli esercizi (ADR 0014 §2).
 *
 * @param fileName - Nome del PDF.
 * @returns `true` per il materiale d'esame.
 */
export function isExamMaterial(fileName: string): boolean {
  return /\bexam\s*prep/i.test(fileName);
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

/** PDF con titolo riconosciuto: posizione nell'elenco dei file e numero. */
interface ParsedFile {
  readonly file: SlideFile;
  readonly index: number;
  readonly number: number;
}

/** PDF dello stesso titolo e lezioni importate con quel titolo (in ordine di corso). */
interface TitleGroup {
  readonly files: ParsedFile[];
  candidates: readonly CatalogLesson[];
}

/** Lezione scelta per un gruppo di PDF, o motivo per lasciarli fuori. */
type Assignment =
  | { readonly lesson: CatalogLesson; readonly files: readonly ParsedFile[] }
  | { readonly reason: string; readonly files: readonly ParsedFile[] };

/**
 * Abbina i PDF alle lezioni importate per titolo (ADR 0012).
 *
 * Lo zip del portale elenca i PDF nell'ordine del corso, e le presentazioni
 * di una lezione sono file consecutivi ("blocco"). Più lezioni dello stesso
 * corso possono avere lo stesso titolo (es. due "Examples" in capitoli
 * diversi): la numerazione allora prosegue (`Examples-1…3` nel capitolo 2,
 * `Examples-4…6` nel capitolo 4) e ogni blocco è una lezione. Così:
 *
 * - le lezioni candidate si limitano alla materia dello zip, riconosciuta dai
 *   PDF con un titolo unico (o a `subject`, se indicata);
 * - se i blocchi sono tanti quante le lezioni candidate, si abbinano in ordine
 *   di corso;
 * - altrimenti ogni blocco si abbina guardando le lezioni dei file subito
 *   prima e subito dopo (vedi {@link resolveByAdjacentLessons});
 * - le presentazioni di queste lezioni si rinumerano da 1.
 *
 * Con una cartella estratta l'ordine dello zip è perso: i titoli ripetuti
 * restano fuori. Un file che non trova una lezione, o non può sceglierne una
 * con certezza, resta fuori con il motivo: nessun abbinamento a indovinare.
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

  const unmatched: (UnmatchedFile & { readonly index: number })[] = [];
  const groups = new Map<string, TitleGroup>();
  for (const [index, file] of files.entries()) {
    const name = parseSlideFileName(file.fileName);
    if (!name) {
      unmatched.push({
        fileName: file.fileName,
        reason: 'il nome non è "titolo-numero.pdf"',
        index,
      });
      continue;
    }
    const key = normalizeTitle(name.title);
    const group = groups.get(key) ?? { files: [], candidates: byTitle.get(key) ?? [] };
    group.files.push({ file, index, number: name.number });
    groups.set(key, group);
  }

  const ordered = files.every((file) => file.archiveOrder !== undefined);
  const anchors = anchorLessons(groups, ordered);
  restrictToZipSubject(groups, anchors);

  const courseIndex = new Map(lessons.map((lesson, index) => [lesson.lessonId, index]));
  const matched = new Map<string, { lesson: CatalogLesson; files: MatchedFile[] }>();
  const renumbered = new Set<string>();
  for (const group of groups.values()) {
    const blocks = ordered ? splitIntoBlocks(group.files) : [group.files];
    for (const assignment of assignGroup(group, blocks, ordered, anchors, courseIndex)) {
      if ('reason' in assignment) {
        for (const item of assignment.files) {
          unmatched.push({
            fileName: item.file.fileName,
            reason: assignment.reason,
            index: item.index,
          });
        }
        continue;
      }
      const { lesson } = assignment;
      if (group.candidates.length > 1 || blocks.length > 1) renumbered.add(lesson.lessonId);
      const entry = matched.get(lesson.lessonId) ?? { lesson, files: [] };
      for (const item of assignment.files) {
        if (entry.files.some((existing) => existing.number === item.number)) {
          unmatched.push({
            fileName: item.file.fileName,
            reason: 'numero di presentazione ripetuto',
            index: item.index,
          });
          continue;
        }
        entry.files.push({ number: item.number, file: item.file });
      }
      matched.set(lesson.lessonId, entry);
    }
  }

  for (const [lessonId, entry] of matched) {
    entry.files.sort((a, b) => a.number - b.number);
    if (renumbered.has(lessonId)) {
      // La numerazione dello zip prosegue tra lezioni omonime: si riparte da 1.
      entry.files = entry.files.map((deck, rank) => ({ number: rank + 1, file: deck.file }));
    }
  }
  const inFileOrder = unmatched
    .sort((a, b) => a.index - b.index)
    .map(({ fileName, reason }) => ({ fileName, reason }));
  return { matched, unmatched: inFileOrder };
}

/**
 * Lezioni certe: titolo di una sola lezione e, nello zip, un solo blocco di
 * file. Servono da punti di riferimento per materia e lezioni vicine.
 *
 * @returns La lezione certa di ogni file, per posizione nell'elenco dei file.
 */
function anchorLessons(
  groups: ReadonlyMap<string, TitleGroup>,
  ordered: boolean,
): Map<number, CatalogLesson> {
  const anchors = new Map<number, CatalogLesson>();
  for (const group of groups.values()) {
    const [lesson] = group.candidates;
    if (!lesson || group.candidates.length > 1) continue;
    if (ordered && splitIntoBlocks(group.files).length > 1) continue;
    for (const item of group.files) anchors.set(item.index, lesson);
  }
  return anchors;
}

/**
 * Tra lezioni omonime di materie diverse tiene quelle della materia dello zip:
 * quella della maggior parte dei file con una lezione certa. I titoli di una
 * sola lezione non si toccano (uno zip potrebbe coprire più materie).
 */
function restrictToZipSubject(
  groups: ReadonlyMap<string, TitleGroup>,
  anchors: ReadonlyMap<number, CatalogLesson>,
): void {
  const votes = new Map<string, number>();
  for (const lesson of anchors.values()) {
    votes.set(lesson.subjectTitle, (votes.get(lesson.subjectTitle) ?? 0) + 1);
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  // Solo una maggioranza netta: a pari merito la materia resta incerta.
  if (!top || ranked[1]?.[1] === top[1]) return;
  for (const group of groups.values()) {
    if (group.candidates.length < 2) continue;
    const inSubject = group.candidates.filter((lesson) => lesson.subjectTitle === top[0]);
    if (inSubject.length > 0) group.candidates = inSubject;
  }
}

/** Divide i file di un titolo in blocchi di file consecutivi nell'elenco. */
function splitIntoBlocks(items: readonly ParsedFile[]): ParsedFile[][] {
  const blocks: ParsedFile[][] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    const previous = last?.at(-1);
    if (last && previous && item.index === previous.index + 1) last.push(item);
    else blocks.push([item]);
  }
  return blocks;
}

/** Sceglie la lezione di ogni blocco di file con lo stesso titolo. */
function assignGroup(
  group: TitleGroup,
  blocks: readonly (readonly ParsedFile[])[],
  ordered: boolean,
  anchors: ReadonlyMap<number, CatalogLesson>,
  courseIndex: ReadonlyMap<string, number>,
): Assignment[] {
  const { candidates } = group;
  const [only] = candidates;
  if (!only) {
    return [{ reason: 'nessuna lezione importata con questo titolo', files: group.files }];
  }
  if (candidates.length === 1 && (blocks.length === 1 || !ordered)) {
    return [{ lesson: only, files: group.files }];
  }
  if (!ordered) {
    return [
      {
        reason: `${String(candidates.length)} lezioni con questo titolo: usa lo zip scaricato dal portale, non la cartella estratta`,
        files: group.files,
      },
    ];
  }
  if (blocks.length === candidates.length) {
    return blocks.map((files, rank) => ({ lesson: candidates[rank] ?? only, files }));
  }
  return blocks.map((files) => {
    const lesson = resolveByAdjacentLessons(files, candidates, anchors, courseIndex);
    return lesson
      ? { lesson, files }
      : {
          reason: `${String(candidates.length)} lezioni importate con questo titolo e ${String(blocks.length)} gruppi di PDF nello zip: non so con certezza a quale vada`,
          files,
        };
  });
}

/**
 * Sceglie la lezione di un blocco guardando le lezioni certe dei file subito
 * prima e subito dopo nello zip: va bene una candidata nello stesso capitolo
 * della lezione prima (e dopo di lei nel corso) o nello stesso capitolo della
 * lezione dopo (e prima di lei nel corso).
 *
 * @returns La lezione, o `undefined` se non ce n'è esattamente una.
 */
function resolveByAdjacentLessons(
  block: readonly ParsedFile[],
  candidates: readonly CatalogLesson[],
  anchors: ReadonlyMap<number, CatalogLesson>,
  courseIndex: ReadonlyMap<string, number>,
): CatalogLesson | undefined {
  const first = block[0];
  const last = block.at(-1);
  if (!first || !last) return undefined;
  const before = anchors.get(first.index - 1);
  const after = anchors.get(last.index + 1);
  const position = (lesson: CatalogLesson) => courseIndex.get(lesson.lessonId) ?? -1;
  const sameChapter = (a: CatalogLesson, b: CatalogLesson) =>
    a.subjectTitle === b.subjectTitle && a.chapterTitle === b.chapterTitle;
  const fits = candidates.filter(
    (lesson) =>
      (before !== undefined &&
        sameChapter(lesson, before) &&
        position(lesson) > position(before)) ||
      (after !== undefined && sameChapter(lesson, after) && position(lesson) < position(after)),
  );
  return fits.length === 1 ? fits[0] : undefined;
}
