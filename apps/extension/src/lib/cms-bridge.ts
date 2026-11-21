/**
 * Ponte tra il content script dell'estensione (mondo isolato) e la pagina del
 * portale (mondo principale).
 *
 * Il portale tiene il token di accesso al CMS solo in memoria e lo manda come
 * `Authorization: Bearer …` nelle sue richieste: né lo storage né i cookie
 * bastano per leggere le lezioni. Lo script nel mondo principale
 * (`portal-main.content.ts`) ricorda l'ultimo header usato dal portale verso il
 * CMS ed esegue per l'estensione solo le GET di questo elenco. Il token non
 * esce mai dalla pagina: all'estensione arriva solo il JSON della risposta.
 *
 * Lo stesso script conserva una copia ridotta dell'albero del corso che il
 * portale scarica per la barra laterale (`treeCourseId`, `pruneTree`): è
 * l'indice di capitoli e lezioni, e non costa nessuna richiesta in più.
 */

/** Origine del CMS del portale. */
export const CMS_ORIGIN = 'https://cms.epicode.edu.mt';

/** Marcatore dei messaggi del ponte (per ignorare gli altri `postMessage`). */
export const BRIDGE_SOURCE = 'epicfeed-bridge';

/** Lettura di una voce del CMS, dal mondo isolato al mondo principale. */
export interface BridgeGetRequest {
  readonly source: typeof BRIDGE_SOURCE;
  readonly kind: 'request';
  readonly id: string;
  readonly path: string;
}

/** Richiesta dell'indice del corso già scaricato dal portale. */
export interface BridgeOutlineRequest {
  readonly source: typeof BRIDGE_SOURCE;
  readonly kind: 'outline';
  readonly id: string;
  readonly courseId: string;
}

/** Richiesta dal mondo isolato al mondo principale. */
export type BridgeRequest = BridgeGetRequest | BridgeOutlineRequest;

/**
 * Risposta dal mondo principale: stato HTTP e corpo JSON (0 = nessun token o
 * rete; per l'indice 404 = non ancora visto).
 */
export interface BridgeResponse {
  readonly source: typeof BRIDGE_SOURCE;
  readonly kind: 'response';
  readonly id: string;
  readonly status: number;
  readonly body: unknown;
}

// Solo campi semplici o con un livello di relazione, mai jolly (`*`).
const ALLOWED_FIELDS = new Set([
  'id',
  'title',
  'type',
  'sort',
  'parent',
  'embed_type',
  'url',
  'summary',
  'markdown',
  'starts_at',
  'tenant.id',
  'tenant.name',
  'children.id',
  'children.title',
  'children.type',
  'children.embed_type',
  'children.sort',
  'children.visibility.hidden',
]);
const PATH = /^\/items\/(content|courses)\/(\d{1,12})\?(.+)$/;

/**
 * Dice se un percorso è una delle letture ammesse: una sola voce di
 * `content` o `courses`, per id numerico, con soli campi dell'elenco.
 *
 * @param path - Percorso relativo al CMS, con la query.
 * @returns `true` se la richiesta si può eseguire.
 */
export function isAllowedPath(path: string): boolean {
  const match = PATH.exec(path);
  if (!match?.[3]) return false;
  const params = match[3].split('&');
  return params.every((param) => {
    const [key, value] = param.split('=');
    return (
      key === 'fields[]' && value !== undefined && ALLOWED_FIELDS.has(decodeURIComponent(value))
    );
  });
}

function bridgeFields(data: unknown): Partial<Record<string, unknown>> | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Partial<Record<string, unknown>>;
  return message.source === BRIDGE_SOURCE && typeof message.id === 'string' ? message : null;
}

/**
 * Riconosce una richiesta del ponte (lettura o indice).
 *
 * @param data - `event.data` di un `MessageEvent`.
 * @returns `true` se è una richiesta ben formata.
 */
export function isBridgeRequest(data: unknown): data is BridgeRequest {
  const message = bridgeFields(data);
  if (!message) return false;
  if (message.kind === 'request') return typeof message.path === 'string';
  return (
    message.kind === 'outline' &&
    typeof message.courseId === 'string' &&
    /^\d{1,12}$/.test(message.courseId)
  );
}

/**
 * Riconosce una risposta del ponte.
 *
 * @param data - `event.data` di un `MessageEvent`.
 * @returns `true` se è una risposta del ponte.
 */
export function isBridgeResponse(data: unknown): data is BridgeResponse {
  const message = bridgeFields(data);
  return message?.kind === 'response' && typeof message.status === 'number';
}

/**
 * Se una richiesta del portale è quella dell'albero del corso (barra laterale
 * del curriculum: `GET /items/content?filter[courses][course][_eq]={id}&filter[type]=unit`),
 * restituisce l'id del corso.
 *
 * @param url - Indirizzo della richiesta fatta dal portale.
 * @returns L'id del corso, oppure `null`.
 */
export function treeCourseId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== CMS_ORIGIN || parsed.pathname !== '/items/content') return null;
  if (parsed.searchParams.get('filter[type]') !== 'unit') return null;
  const courseId = parsed.searchParams.get('filter[courses][course][_eq]') ?? '';
  return /^\d{1,12}$/.test(courseId) ? courseId : null;
}

const TREE_FIELDS = ['id', 'title', 'type', 'embed_type', 'sort'] as const;
const VISIBILITY_FIELDS = ['hidden', 'opens_at', 'closes_at'] as const;
/** Unità → modulo → attività → parte. */
const TREE_DEPTH = 4;
const MAX_NODES = 5000;

/**
 * Riduce l'albero del corso ai soli campi dell'indice: niente testi, corpi
 * Editor.js o altri dati. Gira nel mondo principale, quindi senza dipendenze;
 * la validazione vera è `parseOutline` nel mondo isolato.
 *
 * @param json - Risposta del portale (`{ data: unità[] }`).
 * @returns L'albero ridotto, oppure `null` se la forma non è quella attesa.
 */
export function pruneTree(json: unknown): { data: unknown[] } | null {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  let budget = MAX_NODES;

  const prune = (node: unknown, depth: number): Record<string, unknown> | null => {
    if (typeof node !== 'object' || node === null || budget <= 0) return null;
    budget -= 1;
    const source = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const field of TREE_FIELDS) {
      const value = source[field];
      if (typeof value === 'string' || typeof value === 'number' || value === null) {
        out[field] = typeof value === 'string' ? value.slice(0, 300) : value;
      }
    }
    const visibility = source.visibility;
    if (typeof visibility === 'object' && visibility !== null) {
      const picked: Record<string, unknown> = {};
      for (const field of VISIBILITY_FIELDS) {
        const value = (visibility as Record<string, unknown>)[field];
        if (typeof value === 'string' || typeof value === 'boolean' || value === null) {
          picked[field] = value;
        }
      }
      out.visibility = picked;
    }
    if (depth < TREE_DEPTH - 1 && Array.isArray(source.children)) {
      out.children = source.children
        .map((child) => prune(child, depth + 1))
        .filter((child) => child !== null);
    }
    return out;
  };

  return { data: data.map((unit) => prune(unit, 0)).filter((unit) => unit !== null) };
}
