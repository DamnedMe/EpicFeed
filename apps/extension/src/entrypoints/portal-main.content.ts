import {
  BRIDGE_SOURCE,
  CMS_ORIGIN,
  isAllowedPath,
  isBridgeRequest,
  pruneTree,
  treeCourseId,
} from '../lib/cms-bridge';
import type { BridgeResponse } from '../lib/cms-bridge';

/** Indici di corso tenuti in memoria (gli ultimi aperti). */
const MAX_OUTLINES = 3;

/**
 * Script nel mondo principale della pagina del portale (vedi `lib/cms-bridge.ts`).
 *
 * 1. Osserva le richieste che il portale stesso fa al CMS e ricorda l'header
 *    `Authorization` (il token è solo in memoria, non nello storage).
 * 2. Tiene una copia ridotta dell'albero del corso che il portale scarica per
 *    la barra laterale (solo id, titoli, tipi, ordine e visibilità): l'indice
 *    di capitoli e lezioni costa zero richieste in più.
 * 3. Su richiesta del content script dell'estensione esegue una GET
 *    dell'elenco ammesso con quell'header, o restituisce l'indice.
 *
 * Non fa nulla da solo, non scrive mai sul CMS e non comunica il token a
 * nessuno: resta in una variabile di questa closure.
 */
export default defineContentScript({
  matches: ['https://learn.epicode.edu.mt/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    let authorization: string | null = null;
    const urls = new WeakMap<XMLHttpRequest, string>();
    const outlines = new Map<string, { data: unknown[] }>();

    // eslint-disable-next-line @typescript-eslint/unbound-method -- si richiama con .apply
    const open = XMLHttpRequest.prototype.open;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- si richiama con .call
    const setHeader = XMLHttpRequest.prototype.setRequestHeader;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- si richiama con .apply
    const send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      urls.set(this, String(args[1]));
      (open as (...rest: unknown[]) => void).apply(this, args);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (
      this: XMLHttpRequest,
      name: string,
      value: string,
    ) {
      if (
        name.toLowerCase() === 'authorization' &&
        /^Bearer [\w.-]{20,4096}$/.test(value) &&
        (urls.get(this) ?? '').startsWith(CMS_ORIGIN + '/')
      ) {
        authorization = value;
      }
      setHeader.call(this, name, value);
    };
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
      const courseId = treeCourseId(urls.get(this) ?? '');
      if (courseId) {
        this.addEventListener('load', () => {
          if (this.status !== 200) return;
          try {
            const json: unknown =
              this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
            const tree = pruneTree(json);
            if (!tree) return;
            outlines.delete(courseId);
            outlines.set(courseId, tree);
            for (const key of [...outlines.keys()].slice(0, -MAX_OUTLINES)) outlines.delete(key);
          } catch {
            // Risposta non leggibile: l'indice resta quello di prima.
          }
        });
      }
      (send as (...rest: unknown[]) => void).apply(this, args);
    };

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!isBridgeRequest(event.data)) return;
      const request = event.data;
      const reply = (status: number, body: unknown) => {
        const message: BridgeResponse = {
          source: BRIDGE_SOURCE,
          kind: 'response',
          id: request.id,
          status,
          body,
        };
        window.postMessage(message, window.location.origin);
      };

      if (request.kind === 'outline') {
        const tree = outlines.get(request.courseId);
        reply(tree ? 200 : 404, tree ?? null);
        return;
      }
      if (!isAllowedPath(request.path)) {
        reply(400, null);
        return;
      }
      if (!authorization) {
        reply(0, null);
        return;
      }
      void fetch(CMS_ORIGIN + request.path, {
        method: 'GET',
        headers: { accept: 'application/json', authorization },
        credentials: 'omit',
      })
        .then(async (response) => {
          reply(response.status, await response.json().catch(() => null));
        })
        .catch(() => {
          reply(0, null);
        });
    });
  },
});
