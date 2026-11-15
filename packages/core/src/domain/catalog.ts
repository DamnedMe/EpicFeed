import type { BookId, ChapterId, LessonId, LessonPartId } from './ids.js';
import { DomainError } from './errors.js';
import { requirePosition, requireTitle } from './text.js';

/**
 * Fonte di studio. Una lezione Epicode e un libro personale hanno la stessa
 * struttura a valle (unità → schede), così feed, quiz e ripasso sono unici
 * (architettura §3). I libri arrivano con la milestone M7.
 */
export type Source =
  | { readonly kind: 'epicode-lesson'; readonly lessonId: LessonId }
  | { readonly kind: 'book'; readonly bookId: BookId };

/**
 * Lezione del catalogo condiviso (in Directus: `activity`). Contiene i soli
 * metadati: il contenuto vive nelle versioni delle sue parti.
 */
export interface Lesson {
  readonly id: LessonId;
  readonly chapterId: ChapterId;
  /** Id della lezione sul portale Epicode, usato per riconoscerla al reimport. */
  readonly epicodeId: string;
  readonly title: string;
  /** Ordine all'interno del capitolo, da 0. */
  readonly position: number;
}

/**
 * Tipo di parte di lezione:
 * - `video`: parte con video Vimeo, riassunti e sottotitoli;
 * - `reading`: testo da leggere (riassunto di capitolo in markdown, documento).
 */
export type LessonPartKind = 'video' | 'reading';

/**
 * Parte di una lezione (in Directus: contenuto vimeo, markdown o googledocs).
 * È l'unità su cui si concedono i permessi (prova di possesso, ADR 0002).
 */
export interface LessonPart {
  readonly id: LessonPartId;
  readonly lessonId: LessonId;
  readonly epicodeId: string;
  readonly kind: LessonPartKind;
  readonly title: string;
  readonly position: number;
}

/**
 * Crea una {@link Lesson} validando e normalizzando i campi.
 *
 * @param input - Campi grezzi della lezione.
 * @returns La lezione valida e immutabile.
 * @throws {@link DomainError} se titolo, posizione o id Epicode non sono validi.
 */
export function createLesson(input: Lesson): Lesson {
  return Object.freeze({
    id: input.id,
    chapterId: input.chapterId,
    epicodeId: requireEpicodeId(input.epicodeId),
    title: requireTitle(input.title, 'Titolo della lezione'),
    position: requirePosition(input.position, 'Posizione della lezione'),
  });
}

/**
 * Crea una {@link LessonPart} validando e normalizzando i campi.
 *
 * @param input - Campi grezzi della parte.
 * @returns La parte valida e immutabile.
 * @throws {@link DomainError} se titolo, posizione, tipo o id Epicode non sono validi.
 */
export function createLessonPart(input: LessonPart): LessonPart {
  // Il tipo arriva da dati esterni: lo verifichiamo anche a runtime.
  if (!PART_KINDS.includes(input.kind)) {
    throw new DomainError('INVALID_CONTENT', 'Tipo di parte sconosciuto');
  }
  return Object.freeze({
    id: input.id,
    lessonId: input.lessonId,
    epicodeId: requireEpicodeId(input.epicodeId),
    kind: input.kind,
    title: requireTitle(input.title, 'Titolo della parte'),
    position: requirePosition(input.position, 'Posizione della parte'),
  });
}

const PART_KINDS: readonly string[] = ['video', 'reading'] satisfies LessonPartKind[];

// Gli id Directus sono interi o UUID: accettiamo solo caratteri sicuri, così
// l'id si può usare senza escaping in URL e log.
const EPICODE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function requireEpicodeId(value: string): string {
  const trimmed = value.trim();
  if (!EPICODE_ID_PATTERN.test(trimmed)) {
    throw new DomainError('INVALID_ID', 'Id Epicode non valido');
  }
  return trimmed;
}
