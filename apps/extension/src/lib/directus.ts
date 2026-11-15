import { z } from 'zod';

/**
 * Lettura dal CMS del portale (Directus su `cms.epicode.edu.mt`).
 *
 * Regole (docs/portal-recon.md):
 * - solo richieste GET, solo su `items/content` e `items/courses`;
 * - sempre l'elenco esplicito dei campi (mai `fields=*.*`, che restituisce
 *   anche dati di altri studenti);
 * - nessuna scrittura, in particolare sulle collezioni di progresso.
 */

/** Base del CMS del portale. */
export const DIRECTUS_BASE = 'https://cms.epicode.edu.mt';

const id = z.union([z.number().int(), z.string()]).transform(String);

const contentRefSchema = z.object({
  data: z.object({ id, type: z.string(), parent: id.nullable() }),
});

const childSchema = z.object({
  id,
  title: z.string().nullable(),
  type: z.string(),
  embed_type: z.string().nullable().optional(),
  sort: z.number().nullable(),
  url: z.string().nullable().optional(),
  summary: z
    .object({ it: z.string().nullable().optional(), en: z.string().nullable().optional() })
    .nullable()
    .optional(),
  markdown: z.string().nullable().optional(),
  visibility: z.object({ hidden: z.boolean().nullable().optional() }).nullable().optional(),
});

const activitySchema = z.object({
  data: z.object({
    id,
    title: z.string(),
    type: z.literal('activity'),
    sort: z.number().nullable(),
    parent: z.object({
      id,
      title: z.string(),
      type: z.string(),
      sort: z.number().nullable(),
      parent: z.object({ id, sort: z.number().nullable() }).nullable(),
    }),
    children: z.array(childSchema),
  }),
});

const courseSchema = z.object({
  data: z.object({
    id,
    title: z.string(),
    starts_at: z.string().nullable().optional(),
    tenant: z.object({ id, name: z.string() }).nullable().optional(),
  }),
});

/** Riferimento a un contenuto: tipo e genitore. */
export type ContentRef = z.infer<typeof contentRefSchema>['data'];
/** Attività (lezione) con modulo, unità e parti. */
export type Activity = z.infer<typeof activitySchema>['data'];
/** Parte di un'attività. */
export type ActivityChild = z.infer<typeof childSchema>;
/** Corso Epicode (la materia). */
export type Course = z.infer<typeof courseSchema>['data'];

/** Funzione di richiesta iniettata (nei test un doppio, nel portale `fetch`). */
export type GetJson = (path: string) => Promise<unknown>;

const ACTIVITY_FIELDS = [
  'id',
  'title',
  'type',
  'sort',
  'parent.id',
  'parent.title',
  'parent.type',
  'parent.sort',
  'parent.parent.id',
  'parent.parent.sort',
  'children.id',
  'children.title',
  'children.type',
  'children.embed_type',
  'children.sort',
  'children.url',
  'children.summary',
  'children.markdown',
  'children.visibility.hidden',
];

function fields(list: string[]): string {
  return list.map((field) => `fields[]=${encodeURIComponent(field)}`).join('&');
}

/** Client minimo del CMS con i soli campi che servono all'import. */
export class DirectusClient {
  /**
   * @param getJson - Esegue una GET relativa a {@link DIRECTUS_BASE} e restituisce il JSON.
   */
  constructor(private readonly getJson: GetJson) {}

  /**
   * Tipo e genitore di un contenuto (per risalire all'attività).
   *
   * @param contentId - Id del contenuto aperto.
   * @returns Il riferimento.
   */
  async contentRef(contentId: string): Promise<ContentRef> {
    const json = await this.getJson(
      `/items/content/${encodeURIComponent(contentId)}?${fields(['id', 'type', 'parent'])}`,
    );
    return contentRefSchema.parse(json).data;
  }

  /**
   * Attività con modulo, unità e parti (riassunti e markdown inclusi).
   *
   * @param activityId - Id dell'attività.
   * @returns L'attività.
   */
  async activity(activityId: string): Promise<Activity> {
    const json = await this.getJson(
      `/items/content/${encodeURIComponent(activityId)}?${fields(ACTIVITY_FIELDS)}`,
    );
    return activitySchema.parse(json).data;
  }

  /**
   * Titolo, data di inizio e istituto del corso.
   *
   * @param courseId - Id del corso.
   * @returns Il corso.
   */
  async course(courseId: string): Promise<Course> {
    const json = await this.getJson(
      `/items/courses/${encodeURIComponent(courseId)}?${fields([
        'id',
        'title',
        'starts_at',
        'tenant.id',
        'tenant.name',
      ])}`,
    );
    return courseSchema.parse(json).data;
  }
}
