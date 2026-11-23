import { z } from 'zod';
import { locate, type CourseOutline } from './outline';

/**
 * Lettura dal CMS del portale (Directus su `cms.epicode.edu.mt`).
 *
 * Regole (docs/portal-recon.md):
 * - solo richieste GET, solo su `items/content` e `items/courses`;
 * - sempre l'elenco esplicito dei campi (mai `fields=*.*`): si legge solo
 *   ciò che serve all'import;
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

/**
 * Errore HTTP del CMS, con codice e messaggio di Directus quando ci sono
 * (per esempio `FORBIDDEN` su un campo non leggibile, `TOKEN_EXPIRED`).
 */
export class PortalHttpError extends Error {
  /**
   * @param status - Stato HTTP.
   * @param code - Codice di errore di Directus, se presente.
   * @param detail - Messaggio di Directus, se presente (mai dati personali: sono errori di permesso).
   */
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly detail: string | null,
  ) {
    super(`HTTP ${String(status)}${code ? ` ${code}` : ''}`);
  }
}

/**
 * Legge codice e messaggio di errore dal corpo di una risposta Directus.
 *
 * @param body - JSON della risposta (qualsiasi forma).
 * @returns Codice e messaggio, o `null`.
 */
export function directusError(body: unknown): { code: string | null; detail: string | null } {
  const first = (
    body as { errors?: { message?: unknown; extensions?: { code?: unknown } }[] } | null
  )?.errors?.[0];
  const code = typeof first?.extensions?.code === 'string' ? first.extensions.code : null;
  const detail = typeof first?.message === 'string' ? first.message.slice(0, 200) : null;
  return { code, detail };
}

/** Funzione di richiesta iniettata (nei test un doppio, nel portale `fetch`). */
export type GetJson = (path: string) => Promise<unknown>;

// Gli stessi campi che il portale chiede quando si apre una lezione: così
// l'estensione resta dentro i permessi di uno studente e nel traffico normale.
const ACTIVITY_FIELDS = [
  'id',
  'title',
  'type',
  'sort',
  'parent',
  'children.id',
  'children.title',
  'children.type',
  'children.embed_type',
  'children.sort',
  'children.visibility.hidden',
];
const NODE_FIELDS = ['id', 'title', 'type', 'sort', 'parent'];
const PART_FIELDS = ['id', 'type', 'embed_type', 'url', 'summary', 'markdown'];

const activityShellSchema = z.object({
  data: z.object({
    id,
    title: z.string(),
    type: z.literal('activity'),
    sort: z.number().nullable(),
    parent: id,
    children: z.array(childSchema.omit({ url: true, summary: true, markdown: true })),
  }),
});

const nodeSchema = z.object({
  data: z.object({
    id,
    title: z.string().nullable().optional(),
    type: z.string(),
    sort: z.number().nullable(),
    parent: id.nullable(),
  }),
});

const partSchema = z.object({
  data: childSchema.pick({ id: true, url: true, summary: true, markdown: true }),
});

function fields(list: string[]): string {
  return list.map((field) => `fields[]=${encodeURIComponent(field)}`).join('&');
}

/** Opzioni di lettura di un'attività. */
export interface ActivityReadOptions {
  /**
   * Indice del corso già scaricato dal portale: se contiene l'attività,
   * struttura e titoli si prendono da lì e restano da leggere solo le parti.
   */
  readonly outline?: CourseOutline | null;
  /** Attesa prima di ogni parte dopo la prima (ritmo dell'import a lotti). */
  readonly beforePart?: () => Promise<void>;
}

/** Attività senza il contenuto delle parti. */
type ActivityShell = Omit<Activity, 'type'>;

/**
 * Struttura dell'attività ricavata dall'indice del corso, senza richieste.
 *
 * @returns La struttura, oppure `null` se l'indice non contiene l'attività.
 */
function shellFromOutline(outline: CourseOutline, activityId: string): ActivityShell | null {
  const found = locate(outline, activityId);
  if (found?.lesson.id !== activityId) return null;
  const { chapter, lesson } = found;
  return {
    id: lesson.id,
    title: lesson.title,
    sort: lesson.sort,
    parent: {
      id: chapter.id,
      title: chapter.title,
      type: 'module',
      sort: chapter.sort,
      parent: { id: chapter.unitId, sort: chapter.unitSort },
    },
    children: lesson.parts.map((part) => ({
      id: part.id,
      title: part.title,
      type: part.type,
      embed_type: part.embedType,
      sort: part.sort,
    })),
  };
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
   * Con l'indice del corso legge solo il dettaglio delle parti utili (video
   * Vimeo e testi). Senza, legge come fa il portale aprendo una lezione:
   * prima l'attività con l'elenco delle parti, poi modulo e unità, poi le
   * parti. Sempre una richiesta alla volta.
   *
   * @param activityId - Id dell'attività.
   * @param options - Indice del corso e ritmo, se presenti.
   * @returns L'attività.
   */
  async activity(activityId: string, options: ActivityReadOptions = {}): Promise<Activity> {
    const fromOutline = options.outline ? shellFromOutline(options.outline, activityId) : null;
    const shell = fromOutline ?? (await this.shellFromCms(activityId));

    const children: ActivityChild[] = [];
    let first = true;
    for (const child of shell.children) {
      const useful =
        !child.visibility?.hidden &&
        ((child.type === 'embed' && child.embed_type === 'vimeo') || child.type === 'markdown');
      if (!useful) {
        children.push(child);
        continue;
      }
      if (!first) await options.beforePart?.();
      first = false;
      const detail = partSchema.parse(
        await this.getJson(`/items/content/${encodeURIComponent(child.id)}?${fields(PART_FIELDS)}`),
      ).data;
      children.push({
        ...child,
        url: detail.url,
        summary: detail.summary,
        markdown: detail.markdown,
      });
    }

    return activitySchema.parse({ data: { ...shell, type: 'activity', children } }).data;
  }

  /** Struttura dell'attività letta dal CMS: attività, modulo e unità. */
  private async shellFromCms(activityId: string): Promise<ActivityShell> {
    const shell = activityShellSchema.parse(
      await this.getJson(
        `/items/content/${encodeURIComponent(activityId)}?${fields(ACTIVITY_FIELDS)}`,
      ),
    ).data;
    const module = await this.node(shell.parent);
    const unit = module.parent === null ? null : await this.node(module.parent);
    return {
      id: shell.id,
      title: shell.title,
      sort: shell.sort,
      parent: {
        id: module.id,
        title: module.title ?? '',
        type: module.type,
        sort: module.sort,
        parent: unit ? { id: unit.id, sort: unit.sort } : null,
      },
      children: shell.children,
    };
  }

  private async node(nodeId: string): Promise<z.infer<typeof nodeSchema>['data']> {
    return nodeSchema.parse(
      await this.getJson(`/items/content/${encodeURIComponent(nodeId)}?${fields(NODE_FIELDS)}`),
    ).data;
  }

  /**
   * Titolo, data di inizio e istituto del corso.
   *
   * @param courseId - Id del corso.
   * @returns Il corso.
   */
  async course(courseId: string): Promise<Course> {
    const path = `/items/courses/${encodeURIComponent(courseId)}?`;
    try {
      const json = await this.getJson(
        path + fields(['id', 'title', 'starts_at', 'tenant.id', 'tenant.name']),
      );
      return courseSchema.parse(json).data;
    } catch (error) {
      // L'istituto è facoltativo: se il ruolo studente non può leggerlo, si
      // riprova senza e il catalogo usa il corso di studi generico.
      if (!(error instanceof PortalHttpError) || error.status !== 403) throw error;
      const json = await this.getJson(path + fields(['id', 'title', 'starts_at']));
      return courseSchema.parse(json).data;
    }
  }
}
