import type { LessonPartKind } from './catalog.js';
import { requireEpicodeId, requireVideoId } from './catalog.js';
import type { LessonPartContent } from './content.js';
import { hasSummary, normalizeContent } from './content.js';
import { DomainError } from './errors.js';
import type { SubtitleTrack } from './subtitles.js';
import { MAX_SUBTITLE_TRACKS, normalizeSubtitleTrack } from './subtitles.js';
import { requirePosition, requireTitle } from './text.js';

/**
 * Nodo del catalogo come arriva dal portale: id Epicode, titolo e posizione.
 * L'id interno lo assegna il server.
 */
export interface CatalogNodeInput {
  readonly epicodeId: string;
  readonly title: string;
  readonly position: number;
}

/**
 * Percorso di una lezione nel catalogo, dal corso di studi alla lezione.
 *
 * Corrispondenza con il portale (Directus), vedi `docs/technical/import.md`:
 * - `studyProgram`: l'istituto (tenant Directus, es. EIT);
 * - `edition`: l'anno accademico del corso Epicode (es. `2025/26`);
 * - `subject`: il corso Epicode (es. Data Structures and Algorithms);
 * - `chapter`: il modulo (es. "3. Trees");
 * - `lesson`: l'attività (es. "Binary trees").
 */
export interface CatalogPath {
  readonly studyProgram: Omit<CatalogNodeInput, 'position'>;
  readonly edition: { readonly label: string };
  readonly subject: CatalogNodeInput;
  readonly chapter: CatalogNodeInput;
  readonly lesson: CatalogNodeInput;
}

/** Parte di lezione importata: metadati e contenuto testuale. */
export interface ImportedPart extends CatalogNodeInput {
  readonly kind: LessonPartKind;
  /** Id del video Vimeo, solo per le parti video. */
  readonly videoId?: string | undefined;
  readonly content: LessonPartContent;
  /** Tracce di sottotitoli, solo per le parti video (separate dalla versione). */
  readonly subtitles?: readonly SubtitleTrack[] | undefined;
}

/** Lezione importata: dove sta nel catalogo e le sue parti. */
export interface LessonImport {
  readonly path: CatalogPath;
  readonly parts: readonly ImportedPart[];
}

/** Massimo di parti per lezione: sul portale una lezione ne ha 3–10. */
export const MAX_PARTS_PER_LESSON = 40;

const EDITION_LABEL_MAX = 64;

/**
 * Valida e normalizza una lezione importata: titoli, posizioni, id Epicode,
 * contenuti e tracce di sottotitoli in forma canonica, coerenza tra tipo della
 * parte e contenuto, parti non duplicate.
 *
 * @param input - Lezione come arriva dall'estensione (già validata nella forma da zod).
 * @returns La lezione con i metadati normalizzati e le parti in ordine di posizione.
 * @throws {@link DomainError} se un campo non è valido, se non ci sono parti,
 *   se sono troppe, se due parti hanno lo stesso id Epicode o se una parte
 *   video non ha né riassunti né sottotitoli.
 */
export function normalizeLessonImport(input: LessonImport): LessonImport {
  const { path } = input;
  const normalizedPath: CatalogPath = {
    studyProgram: {
      epicodeId: requireEpicodeId(path.studyProgram.epicodeId),
      title: requireTitle(path.studyProgram.title, 'Titolo del corso di studi'),
    },
    edition: { label: requireTitle(path.edition.label, 'Edizione', EDITION_LABEL_MAX) },
    subject: normalizeNode(path.subject, 'materia'),
    chapter: normalizeNode(path.chapter, 'capitolo'),
    lesson: normalizeNode(path.lesson, 'lezione'),
  };

  if (input.parts.length === 0) {
    throw new DomainError('INVALID_CONTENT', 'La lezione non ha parti da importare');
  }
  if (input.parts.length > MAX_PARTS_PER_LESSON) {
    throw new DomainError('INVALID_CONTENT', 'La lezione ha troppe parti');
  }

  const seen = new Set<string>();
  const parts = input.parts.map((part) => {
    const normalized = normalizePart(part);
    if (seen.has(normalized.epicodeId)) {
      throw new DomainError('INVALID_CONTENT', 'Due parti hanno lo stesso id Epicode');
    }
    seen.add(normalized.epicodeId);
    return normalized;
  });
  parts.sort((a, b) => a.position - b.position);

  return { path: normalizedPath, parts };
}

function normalizeNode(node: CatalogNodeInput, label: string): CatalogNodeInput {
  return {
    epicodeId: requireEpicodeId(node.epicodeId),
    title: requireTitle(node.title, `Titolo (${label})`),
    position: requirePosition(node.position, `Posizione (${label})`),
  };
}

function normalizePart(part: ImportedPart): ImportedPart {
  if (part.kind !== part.content.kind) {
    throw new DomainError('INVALID_CONTENT', 'Il tipo della parte non corrisponde al contenuto');
  }
  const subtitles = normalizeTracks(part.subtitles ?? []);
  if (part.kind === 'reading' && (part.videoId !== undefined || subtitles.length > 0)) {
    throw new DomainError('INVALID_CONTENT', 'Una parte di testo non ha video né sottotitoli');
  }
  const content = normalizeContent(part.content);
  if (content.kind === 'video' && !hasSummary(content) && subtitles.length === 0) {
    throw new DomainError('INVALID_CONTENT', 'La parte video non ha né riassunti né sottotitoli');
  }
  return {
    ...normalizeNode(part, 'parte'),
    kind: part.kind,
    videoId: part.videoId === undefined ? undefined : requireVideoId(part.videoId),
    content,
    subtitles,
  };
}

function normalizeTracks(tracks: readonly SubtitleTrack[]): SubtitleTrack[] {
  if (tracks.length > MAX_SUBTITLE_TRACKS) {
    throw new DomainError('INVALID_CONTENT', 'Troppe tracce di sottotitoli');
  }
  const normalized = tracks.map(normalizeSubtitleTrack);
  const languages = new Set(normalized.map((track) => track.language));
  if (languages.size !== normalized.length) {
    throw new DomainError('INVALID_CONTENT', 'Due tracce hanno la stessa lingua');
  }
  return normalized;
}
