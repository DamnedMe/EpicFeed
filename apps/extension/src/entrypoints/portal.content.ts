import { DirectusClient, PortalHttpError, directusError, type Course } from '../lib/directus';
import { BRIDGE_SOURCE, isBridgeResponse } from '../lib/cms-bridge';
import type { BridgeRequest } from '../lib/cms-bridge';
import { buildLessonDraft } from '../lib/lesson';
import {
  lessonPreviewSchema,
  playerCommandMessage,
  readActivityMessage,
  readLessonMessage,
  type LessonPreview,
  type OutlineSummary,
  type ReadActivityResponse,
  type ReadLessonResponse,
} from '../lib/messages';
import { lessonWork, locate, parseOutline, type CourseOutline } from '../lib/outline';
import { BATCH_PACING, jitter } from '../lib/pacing';
import { parsePortalUrl } from '../lib/portal';

/**
 * Script nel portale Epicode. Fa tre cose, e solo su richiesta dell'estensione
 * (mai da solo):
 * 1. legge la lezione aperta dal CMS, tramite il ponte con la pagina
 *    (`portal-main.content.ts`, che usa la sessione del portale) e solo con i
 *    campi necessari, più l'indice del corso che il portale ha già scaricato;
 * 2. negli import di capitolo o corso legge una lezione alla volta, con pause
 *    casuali tra una parte e l'altra;
 * 3. carica e rimuove i player Vimeo nascosti da cui leggere i sottotitoli.
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
      const activity = readActivityMessage.safeParse(message);
      if (activity.success) {
        void readActivity(activity.data.courseId, activity.data.activityId).then(sendResponse);
        return true;
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

const client = new DirectusClient(getJson);
/** Corsi già letti in questa pagina: negli import a lotti il corso si legge una volta. */
const courses = new Map<string, Course>();

async function course(courseId: string): Promise<Course> {
  const cached = courses.get(courseId);
  if (cached) return cached;
  const fresh = await client.course(courseId);
  courses.set(courseId, fresh);
  return fresh;
}

/**
 * Lezione aperta (anteprima) e indice del corso, per il popup.
 * Con l'indice bastano le GET delle parti utili e quella del corso.
 */
async function readLesson(): Promise<ReadLessonResponse> {
  const location = parsePortalUrl(window.location.href);
  if (!location) {
    return { ok: false, error: 'Apri una lezione del corso (una pagina del curriculum).' };
  }
  try {
    const outline = await getOutline(location.courseId);
    let activityId = outline ? (locate(outline, location.contentId)?.lesson.id ?? null) : null;
    if (!activityId) {
      const ref = await client.contentRef(location.contentId);
      const isLesson = ['activity', 'embed', 'markdown', 'quiz', 'article'].includes(ref.type);
      activityId = isLesson ? (ref.type === 'activity' ? ref.id : ref.parent) : null;
    }
    if (!activityId) {
      return { ok: false, error: 'Apri una lezione, non un capitolo o un modulo.' };
    }
    const [activity, info] = await Promise.all([
      client.activity(activityId, { outline }),
      course(location.courseId),
    ]);
    return {
      ok: true,
      preview: toPreview(buildLessonDraft(activity, info)),
      outline: outline ? summarize(outline, info.title, activityId) : null,
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/**
 * Una lezione di un import a lotti: struttura dall'indice, poi il dettaglio
 * delle parti utili una alla volta, con una pausa casuale tra l'una e l'altra.
 */
async function readActivity(courseId: string, activityId: string): Promise<ReadActivityResponse> {
  try {
    const outline = await getOutline(courseId);
    if (!outline) {
      return {
        ok: false,
        fatal: true,
        error: 'Ricarica la pagina del corso su Epicode: l’indice delle lezioni non è disponibile.',
      };
    }
    if (locate(outline, activityId)?.lesson.id !== activityId) {
      return { ok: false, fatal: false, error: 'Lezione non più presente nel corso.' };
    }
    const [activity, info] = await Promise.all([
      client.activity(activityId, {
        outline,
        beforePart: () => sleep(jitter(BATCH_PACING.betweenParts)),
      }),
      course(courseId),
    ]);
    return { ok: true, preview: toPreview(buildLessonDraft(activity, info)) };
  } catch (error) {
    const fatal =
      error instanceof PortalHttpError &&
      (error.status === 401 || error.code === 'NO_SESSION' || error.code === 'TOKEN_EXPIRED');
    return { ok: false, fatal, error: describeError(error) };
  }
}

/** Anteprima valida con almeno una parte, oppure `null`. */
function toPreview(draft: ReturnType<typeof buildLessonDraft>): LessonPreview | null {
  const preview = lessonPreviewSchema.safeParse(draft);
  return preview.success && preview.data.request.parts.length > 0 ? preview.data : null;
}

/** Riassunto dell'indice per il popup: capitoli e lavoro di ogni lezione. */
function summarize(
  outline: CourseOutline,
  courseTitle: string,
  activityId: string,
): OutlineSummary {
  return {
    courseId: outline.courseId,
    courseTitle,
    chapterId: locate(outline, activityId)?.chapter.id ?? null,
    chapters: outline.chapters.slice(0, 200).map((chapter) => ({
      id: chapter.id,
      title: chapter.title.slice(0, 300),
      lessons: chapter.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title.slice(0, 300),
        ...lessonWork(lesson),
      })),
    })),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

/** Invia una richiesta al ponte nel mondo principale e ne attende la risposta. */
function askBridge(
  ask: { kind: 'request'; path: string } | { kind: 'outline'; courseId: string },
): Promise<{ status: number; body: unknown }> {
  const id = crypto.randomUUID();
  const request: BridgeRequest = { ...ask, source: BRIDGE_SOURCE, id };
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      done();
      resolve({ status: 0, body: null });
    }, 15_000);
    const listener = (event: MessageEvent<unknown>) => {
      if (event.source !== window || !isBridgeResponse(event.data)) return;
      if (event.data.id !== id) return;
      done();
      resolve({ status: event.data.status, body: event.data.body });
    };
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', listener);
    };
    window.addEventListener('message', listener);
    window.postMessage(request, window.location.origin);
  });
}

/**
 * Indice del corso già scaricato dal portale (nessuna richiesta al CMS).
 *
 * @returns L'indice, oppure `null` se il portale non l'ha ancora scaricato.
 */
async function getOutline(courseId: string): Promise<CourseOutline | null> {
  const { status, body } = await askBridge({ kind: 'outline', courseId });
  return status === 200 ? parseOutline(courseId, body) : null;
}

/**
 * GET verso il CMS attraverso il ponte con la pagina: il token del portale
 * resta nel mondo principale, qui arriva solo la risposta.
 */
async function getJson(path: string): Promise<unknown> {
  const { status, body } = await askBridge({ kind: 'request', path });
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
