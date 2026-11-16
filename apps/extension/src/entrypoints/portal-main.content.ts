import { CMS_ORIGIN, BRIDGE_SOURCE, isAllowedPath, isBridgeMessage } from '../lib/cms-bridge';
import type { BridgeResponse } from '../lib/cms-bridge';

/**
 * Script nel mondo principale della pagina del portale (vedi `lib/cms-bridge.ts`).
 *
 * 1. Osserva le richieste che il portale stesso fa al CMS e ricorda l'header
 *    `Authorization` (il token è solo in memoria, non nello storage).
 * 2. Su richiesta del content script dell'estensione esegue una GET
 *    dell'elenco ammesso con quell'header e restituisce stato e JSON.
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

    // eslint-disable-next-line @typescript-eslint/unbound-method -- si richiama con .call
    const open = XMLHttpRequest.prototype.open;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- si richiama con .call
    const setHeader = XMLHttpRequest.prototype.setRequestHeader;

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

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!isBridgeMessage(event.data, 'request')) return;
      const { id, path } = event.data;
      const reply = (status: number, body: unknown) => {
        const message: BridgeResponse = {
          source: BRIDGE_SOURCE,
          kind: 'response',
          id,
          status,
          body,
        };
        window.postMessage(message, window.location.origin);
      };
      if (!isAllowedPath(path)) {
        reply(400, null);
        return;
      }
      if (!authorization) {
        reply(0, null);
        return;
      }
      void fetch(CMS_ORIGIN + path, {
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
