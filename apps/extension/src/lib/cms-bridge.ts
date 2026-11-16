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
 */

/** Origine del CMS del portale. */
export const CMS_ORIGIN = 'https://cms.epicode.edu.mt';

/** Marcatore dei messaggi del ponte (per ignorare gli altri `postMessage`). */
export const BRIDGE_SOURCE = 'epicfeed-bridge';

/** Richiesta dal mondo isolato al mondo principale. */
export interface BridgeRequest {
  readonly source: typeof BRIDGE_SOURCE;
  readonly kind: 'request';
  readonly id: string;
  readonly path: string;
}

/** Risposta dal mondo principale: stato HTTP e corpo JSON (0 = nessun token o rete). */
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

/**
 * Riconosce un messaggio del ponte.
 *
 * @param data - `event.data` di un `MessageEvent`.
 * @param kind - Tipo atteso.
 * @returns `true` se è un messaggio del ponte di quel tipo.
 */
export function isBridgeMessage<K extends 'request' | 'response'>(
  data: unknown,
  kind: K,
): data is K extends 'request' ? BridgeRequest : BridgeResponse {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Partial<Record<'source' | 'kind' | 'id', unknown>>;
  return (
    message.source === BRIDGE_SOURCE && message.kind === kind && typeof message.id === 'string'
  );
}
