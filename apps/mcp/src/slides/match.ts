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

/**
 * Abbina i PDF alle lezioni importate per titolo (ADR 0012). Un file che non
 * trova una lezione, o ne trova più di una, resta fuori con il motivo: nessun
 * abbinamento a indovinare.
 *
 * @param files - PDF dello zip.
 * @param lessons - Lezioni importate dallo studente.
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

  const matched = new Map<string, { lesson: CatalogLesson; files: MatchedFile[] }>();
  const unmatched: UnmatchedFile[] = [];
  for (const file of files) {
    const parsed = parseSlideFileName(file.fileName);
    if (!parsed) {
      unmatched.push({ fileName: file.fileName, reason: 'il nome non è "titolo-numero.pdf"' });
      continue;
    }
    const candidates = byTitle.get(normalizeTitle(parsed.title)) ?? [];
    const [lesson] = candidates;
    if (!lesson) {
      unmatched.push({
        fileName: file.fileName,
        reason: 'nessuna lezione importata con questo titolo',
      });
      continue;
    }
    if (candidates.length > 1) {
      unmatched.push({
        fileName: file.fileName,
        reason: `${String(candidates.length)} lezioni con questo titolo: indica la materia`,
      });
      continue;
    }
    const entry = matched.get(lesson.lessonId) ?? { lesson, files: [] };
    if (entry.files.some((existing) => existing.number === parsed.number)) {
      unmatched.push({ fileName: file.fileName, reason: 'numero di presentazione ripetuto' });
      continue;
    }
    entry.files.push({ number: parsed.number, file });
    matched.set(lesson.lessonId, entry);
  }
  for (const entry of matched.values()) entry.files.sort((a, b) => a.number - b.number);
  return { matched, unmatched };
}
