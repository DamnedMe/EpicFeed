import { z } from 'zod';

/**
 * Indice del corso: unità → capitoli (moduli) → lezioni (attività) → parti.
 *
 * Il portale scarica l'albero intero del corso a ogni pagina aperta, per la
 * barra laterale del curriculum. Lo script nel mondo principale della pagina
 * ne conserva una copia ridotta (`pruneTree` in `cms-bridge.ts`): così
 * l'estensione conosce capitoli e lezioni senza nessuna richiesta in più al CMS.
 * L'albero arriva dalla pagina, quindi qui si valida campo per campo.
 */

const id = z.union([z.number().int(), z.string().regex(/^\d{1,12}$/)]).transform(String);

const visibilitySchema = z
  .object({
    hidden: z.boolean().nullable().optional(),
    opens_at: z.string().nullable().optional(),
    closes_at: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const baseNode = {
  id,
  title: z.string().nullable().optional(),
  type: z.string(),
  embed_type: z.string().nullable().optional(),
  sort: z.number().nullable().optional(),
  visibility: visibilitySchema,
};

/**
 * Elenco tollerante: scarta le voci non valide (per esempio gli id numerici
 * che Directus mette al posto dei figli oltre la profondità richiesta).
 */
function lenientArray<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .nullable()
    .optional()
    .transform((list) =>
      (list ?? []).flatMap((entry) => {
        const parsed = item.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      }),
    );
}

const partNode = z.object(baseNode);
const activityNode = z.object({ ...baseNode, children: lenientArray(partNode) });
const moduleNode = z.object({ ...baseNode, children: lenientArray(activityNode) });
const unitNode = z.object({ ...baseNode, children: lenientArray(moduleNode) });

type Visibility = z.infer<typeof visibilitySchema>;

/** Parte di una lezione nell'indice (senza contenuto). */
export interface OutlinePart {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly embedType: string | null;
  readonly sort: number | null;
}

/** Lezione (attività) nell'indice. */
export interface OutlineLesson {
  readonly id: string;
  readonly title: string;
  readonly sort: number | null;
  readonly parts: readonly OutlinePart[];
}

/** Capitolo (modulo) nell'indice, con l'ordine dell'unità che lo contiene. */
export interface OutlineChapter {
  readonly id: string;
  readonly title: string;
  readonly sort: number | null;
  readonly unitId: string;
  readonly unitSort: number | null;
  readonly lessons: readonly OutlineLesson[];
}

/** Indice di un corso: solo i contenuti che lo studente può vedere adesso. */
export interface CourseOutline {
  readonly courseId: string;
  readonly chapters: readonly OutlineChapter[];
}

/**
 * Dice se un contenuto è visibile adesso: non nascosto, già aperto e non
 * ancora chiuso. I contenuti programmati per il futuro restano fuori, come
 * nel portale.
 *
 * @param visibility - Visibilità del contenuto.
 * @param now - Istante di riferimento.
 * @returns `true` se il contenuto è disponibile.
 */
export function isAvailable(visibility: Visibility, now: Date): boolean {
  if (!visibility) return true;
  if (visibility.hidden) return false;
  const opens = visibility.opens_at ? Date.parse(visibility.opens_at) : Number.NaN;
  const closes = visibility.closes_at ? Date.parse(visibility.closes_at) : Number.NaN;
  if (!Number.isNaN(opens) && opens > now.getTime()) return false;
  if (!Number.isNaN(closes) && closes < now.getTime()) return false;
  return true;
}

const bySort = <T extends { sort?: number | null | undefined }>(a: T, b: T) =>
  (a.sort ?? 0) - (b.sort ?? 0);
const title = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

/**
 * Costruisce l'indice del corso dall'albero ridotto del portale.
 *
 * @param courseId - Id del corso.
 * @param tree - Albero ridotto (`{ data: unità[] }`).
 * @param now - Istante per la visibilità (iniettabile nei test).
 * @returns L'indice, oppure `null` se l'albero non ha la forma attesa.
 */
export function parseOutline(
  courseId: string,
  tree: unknown,
  now: Date = new Date(),
): CourseOutline | null {
  const parsed = z.object({ data: lenientArray(unitNode) }).safeParse(tree);
  if (!parsed.success) return null;

  const chapters: OutlineChapter[] = [];
  for (const unit of [...parsed.data.data].sort(bySort)) {
    if (unit.type !== 'unit' || !isAvailable(unit.visibility, now)) continue;
    for (const module of [...unit.children].sort(bySort)) {
      if (module.type !== 'module' || !isAvailable(module.visibility, now)) continue;
      const lessons = [...module.children]
        .sort(bySort)
        .filter((activity) => activity.type === 'activity' && isAvailable(activity.visibility, now))
        .map((activity) => ({
          id: activity.id,
          title: title(activity.title),
          sort: activity.sort ?? null,
          parts: [...activity.children]
            .sort(bySort)
            .filter((part) => isAvailable(part.visibility, now))
            .map((part) => ({
              id: part.id,
              title: title(part.title),
              type: part.type,
              embedType: part.embed_type ?? null,
              sort: part.sort ?? null,
            })),
        }));
      chapters.push({
        id: module.id,
        title: title(module.title),
        sort: module.sort ?? null,
        unitId: unit.id,
        unitSort: unit.sort ?? null,
        lessons,
      });
    }
  }
  return { courseId, chapters };
}

/**
 * Trova la lezione di un contenuto: l'attività stessa o una sua parte.
 *
 * @param outline - Indice del corso.
 * @param contentId - Id dell'attività o di una sua parte.
 * @returns Capitolo e lezione, oppure `null`.
 */
export function locate(
  outline: CourseOutline,
  contentId: string,
): { chapter: OutlineChapter; lesson: OutlineLesson } | null {
  for (const chapter of outline.chapters) {
    for (const lesson of chapter.lessons) {
      if (lesson.id === contentId || lesson.parts.some((part) => part.id === contentId)) {
        return { chapter, lesson };
      }
    }
  }
  return null;
}

/** Una parte è utile al feed se è un video Vimeo o un testo markdown. */
export function isUsefulPart(part: { type: string; embedType?: string | null }): boolean {
  return (part.type === 'embed' && part.embedType === 'vimeo') || part.type === 'markdown';
}

/**
 * Quanto lavoro chiede una lezione: video (dettaglio + player) e testi (dettaglio).
 *
 * @param lesson - Lezione dell'indice.
 * @returns Numero di video e di testi da leggere.
 */
export function lessonWork(lesson: OutlineLesson): { videos: number; readings: number } {
  let videos = 0;
  let readings = 0;
  for (const part of lesson.parts) {
    if (!isUsefulPart(part)) continue;
    if (part.type === 'markdown') readings += 1;
    else videos += 1;
  }
  return { videos, readings };
}
