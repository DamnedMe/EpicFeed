import { DirectusClient, PortalHttpError, directusError } from '../lib/directus';
import { BRIDGE_SOURCE, isBridgeMessage } from '../lib/cms-bridge';
import type { BridgeRequest } from '../lib/cms-bridge';
import { buildLessonDraft } from '../lib/lesson';
import {
  lessonPreviewSchema,
  playerCommandMessage,
  readLessonMessage,
  type ReadLessonResponse,
} from '../lib/messages';
import { parsePortalUrl } from '../lib/portal';

/**
 * Script nel portale Epicode. Fa due cose, e solo su richiesta dell'estensione
 * (mai da solo, mai in background):
 * 1. legge la lezione aperta dal CMS, tramite il ponte con la pagina
 *    (`portal-main.content.ts`, che usa la sessione del portale) e solo con i
 *    campi necessari: le stesse letture che il portale fa aprendo la lezione;
 * 2. carica e rimuove i player Vimeo nascosti da cui leggere i sottotitoli.
 *
 * Il token di accesso del portale resta in questa pagina: non viene mai
 * inviato all'estensione né a EpicFeed.
 */
export default defineContentScript({
  matches: ['https://learn.epicode.edu.mt/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
      // Solo l'estensione stessa (popup o service worker) può dare comandi.
      if (sender.id !== browser.runtime.id) return undefined;

      if (readLessonMessage.safeParse(message).success) {
        void readLesson().then(sendResponse);
        return true; // risposta asincrona
      }
      const command = playerCommandMessage.safeParse(message);
      if (command.success) {
        if (command.data.type === 'sf/mount-player') mountPlayer(command.data.videoId);
        else unmountPlayer(command.data.videoId);
        sendResponse({ ok: true });
      }
      return undefined;
    });
  },
});

async function readLesson(): Promise<ReadLessonResponse> {
  const location = parsePortalUrl(window.location.href);
  if (!location) {
    return { ok: false, error: 'Apri una lezione del corso (una pagina del curriculum).' };
  }
  try {
    const client = new DirectusClient(getJson);
    const ref = await client.contentRef(location.contentId);
    const activityId = ref.type === 'activity' ? ref.id : ref.parent;
    if (!activityId || !['activity', 'embed', 'markdown', 'quiz', 'article'].includes(ref.type)) {
      return { ok: false, error: 'Apri una lezione, non un capitolo o un modulo.' };
    }
    const [activity, course] = await Promise.all([
      client.activity(activityId),
      client.course(location.courseId),
    ]);
    const preview = lessonPreviewSchema.safeParse(buildLessonDraft(activity, course));
    if (!preview.success || preview.data.request.parts.length === 0) {
      return { ok: false, error: 'Questa lezione non ha riassunti da importare.' };
    }
    return { ok: true, preview: preview.data };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Messaggio per lo studente, con il dettaglio tecnico utile a capire il problema. */
function describeError(error: unknown): string {
  if (error instanceof PortalHttpError) {
    const detail = [String(error.status), error.code, error.detail].filter(Boolean).join(' · ');
    if (
      error.status === 401 ||
      error.code === 'TOKEN_EXPIRED' ||
      error.code === 'INVALID_CREDENTIALS'
    ) {
      return `Ricarica la pagina della lezione su Epicode e riprova: l'estensione non vede ancora la sessione del portale. (${detail})`;
    }
    return `Il portale ha rifiutato la lettura della lezione. (${detail})`;
  }
  return 'Lettura della lezione non riuscita: ricarica la pagina del portale e riprova.';
}

/**
 * GET verso il CMS attraverso il ponte con la pagina: il token del portale
 * resta nel mondo principale, qui arriva solo la risposta.
 */
async function getJson(path: string): Promise<unknown> {
  const id = crypto.randomUUID();
  const { status, body } = await new Promise<{ status: number; body: unknown }>((resolve) => {
    const timer = window.setTimeout(() => {
      done();
      resolve({ status: 0, body: null });
    }, 15_000);
    const listener = (event: MessageEvent<unknown>) => {
      if (event.source !== window || !isBridgeMessage(event.data, 'response')) return;
      if (event.data.id !== id) return;
      done();
      resolve({ status: event.data.status, body: event.data.body });
    };
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', listener);
    };
    window.addEventListener('message', listener);
    const request: BridgeRequest = { source: BRIDGE_SOURCE, kind: 'request', id, path };
    window.postMessage(request, window.location.origin);
  });
  if (status === 0) {
    // Nessun token ancora visto (pagina aperta prima di installare
    // l'estensione) o rete assente.
    throw new PortalHttpError(401, 'NO_SESSION', null);
  }
  if (status < 200 || status >= 300) {
    const { code, detail } = directusError(body);
    throw new PortalHttpError(status, code, detail);
  }
  return body;
}

const PLAYER_PREFIX = 'study-feed-player-';

/**
 * Carica il player di un video, nascosto e senza avvio automatico, dentro la
 * pagina del portale: è l'unico contesto in cui Vimeo concede il player
 * (incorporamento consentito solo sui domini Epicode).
 */
function mountPlayer(videoId: string): void {
  unmountPlayer(videoId);
  const frame = document.createElement('iframe');
  frame.id = PLAYER_PREFIX + videoId;
  frame.src = `https://player.vimeo.com/video/${videoId}?autoplay=0&muted=1&dnt=1#sf-import`;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.width = '1';
  frame.height = '1';
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  document.documentElement.append(frame);
}

function unmountPlayer(videoId: string): void {
  document.getElementById(PLAYER_PREFIX + videoId)?.remove();
}
