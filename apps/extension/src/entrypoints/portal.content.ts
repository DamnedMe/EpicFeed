import { DIRECTUS_BASE, DirectusClient } from '../lib/directus';
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
 * 1. legge la lezione aperta dal CMS, con le stesse credenziali della pagina
 *    e solo i campi necessari (3 richieste GET);
 * 2. carica e rimuove i player Vimeo nascosti da cui leggere i sottotitoli.
 *
 * Il token di accesso del portale resta in questa pagina: non viene mai
 * inviato all'estensione né a Study Feed.
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
    return {
      ok: false,
      error:
        error instanceof PortalError
          ? error.message
          : 'Lettura della lezione non riuscita: ricarica la pagina del portale e riprova.',
    };
  }
}

class PortalError extends Error {}

/** GET verso il CMS con le credenziali della pagina (cookie e, se c'è, il token). */
async function getJson(path: string): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = readPortalToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${DIRECTUS_BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });
  if (response.status === 401 || response.status === 403) {
    throw new PortalError('Sessione del portale scaduta: rientra su Epicode e riprova.');
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function readPortalToken(): string | null {
  try {
    const raw = window.localStorage.getItem('auth_token');
    if (!raw) return null;
    // Il portale può salvarlo come stringa JSON ("…") o in chiaro.
    const value = raw.startsWith('"') ? (JSON.parse(raw) as unknown) : raw;
    return typeof value === 'string' && /^[\w.-]{10,4096}$/.test(value) ? value : null;
  } catch {
    return null;
  }
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
