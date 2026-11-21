import { runBatchJob } from '../lib/batch-job';
import { acceptConnection, usableConnection, type Connection } from '../lib/connection';
import { runImportJob, type ImportJobDeps } from '../lib/import-job';
import { IMPORTED_KEY, readImported, withImported } from '../lib/imported';
import {
  importControlMessage,
  playerTracksMessage,
  readActivityResponse,
  startBatchImportMessage,
  startImportMessage,
  type BatchPlan,
  type ImportStatus,
  type ReadActivityResponse,
} from '../lib/messages';
import { APP_ORIGINS } from '../lib/origins';
import type { PlayerTrack } from '../lib/player-config';

/** Tempo massimo di attesa delle tracce da un player. */
const PLAYER_TIMEOUT_MS = 20_000;
/** Tempo massimo per leggere una lezione dal portale (pause comprese). */
const READ_TIMEOUT_MS = 120_000;
/**
 * Intervallo del segnale di vita: un service worker MV3 inattivo per 30 s
 * viene chiuso, e con lui l'import di un corso durante una pausa lunga.
 */
const KEEPALIVE_MS = 20_000;

/**
 * Service worker dell'estensione:
 * - riceve dalla web app il collegamento (token di import);
 * - coordina gli import avviati dal popup (lezione, capitolo o corso): letture
 *   dal portale tramite lo script nella pagina, player nascosti uno alla
 *   volta, download dei sottotitoli, invio a EpicFeed;
 * - scrive lo stato in `storage.session`, da cui lo legge il popup.
 */
export default defineBackground(() => {
  const waiting = new Map<string, (tracks: PlayerTrack[]) => void>();
  let running = false;
  let cancelled = false;

  browser.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
    const connection = acceptConnection(message, sender.origin ?? sender.url, APP_ORIGINS);
    if (!connection) {
      sendResponse({ ok: false });
      return undefined;
    }
    void browser.storage.local.set({ connection }).then(() => {
      sendResponse({ ok: true, version: browser.runtime.getManifest().version });
    });
    return true;
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return undefined;

    const tracks = playerTracksMessage.safeParse(message);
    if (tracks.success) {
      // Le tracce valgono solo se arrivano da un player di Vimeo.
      if (sender.url && new URL(sender.url).hostname === 'player.vimeo.com') {
        waiting.get(tracks.data.videoId)?.(tracks.data.tracks);
      }
      return undefined;
    }

    const control = importControlMessage.safeParse(message);
    if (control.success) {
      if (control.data.type === 'sf/stop-import' && running) cancelled = true;
      sendResponse({ running, cancelled });
      return undefined;
    }

    const single = startImportMessage.safeParse(message);
    const batch = single.success ? null : startBatchImportMessage.safeParse(message);
    if (!single.success && !batch?.success) return undefined;
    if (running) {
      sendResponse({ ok: false, error: 'Un import è già in corso.' });
      return undefined;
    }
    if (single.success) {
      const { tabId, preview } = single.data;
      void startJob(tabId, async (connection, deps) => {
        const status = await runImportJob(preview, connection, deps);
        if (status.phase === 'done') await remember(preview.request.path.lesson.epicodeId);
      }).then(sendResponse);
    } else if (batch?.success) {
      const { tabId, plan } = batch.data;
      void startJob(tabId, (connection, deps) => runBatch(tabId, plan, connection, deps)).then(
        sendResponse,
      );
    }
    return true;
  });

  /**
   * Avvia un job se l'estensione è collegata, con il segnale di vita attivo
   * finché dura.
   */
  async function startJob(
    tabId: number,
    job: (connection: Connection, deps: ImportJobDeps) => Promise<unknown>,
  ): Promise<{ ok: boolean; error?: string }> {
    const stored = await browser.storage.local.get('connection');
    const connection = usableConnection(stored.connection);
    if (!connection) return { ok: false, error: 'Collega prima l’estensione dalla web app.' };

    running = true;
    cancelled = false;
    const keepalive = setInterval(() => {
      void browser.runtime.getPlatformInfo();
    }, KEEPALIVE_MS);
    void job(connection, baseDeps(tabId))
      .catch(() => report({ phase: 'error', message: 'Import interrotto da un errore inatteso.' }))
      .finally(() => {
        clearInterval(keepalive);
        running = false;
        cancelled = false;
      });
    return { ok: true };
  }

  function runBatch(
    tabId: number,
    plan: BatchPlan,
    connection: Connection,
    deps: ImportJobDeps,
  ): Promise<ImportStatus> {
    return runBatchJob(plan, connection, {
      ...deps,
      readLesson: (activityId) => readLesson(tabId, plan.courseId, activityId),
      isCancelled: () => cancelled,
      markImported: (activityId) => remember(activityId),
      now: () => Date.now(),
    });
  }

  function baseDeps(tabId: number): ImportJobDeps {
    return {
      loadTracks: (videoId) => loadTracks(tabId, videoId),
      fetchText: async (url) => {
        if (new URL(url).hostname !== 'captions.vimeo.com') throw new Error('host non ammesso');
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      },
      pause,
      report,
      fetch: (input, init) => fetch(input, init),
    };
  }

  function report(status: ImportStatus): Promise<void> {
    return browser.storage.session.set({ importStatus: status });
  }

  /** Pausa che finisce prima se lo studente interrompe l'import. */
  async function pause(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (!cancelled && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000, end - Date.now())));
    }
  }

  /** Ricorda una lezione importata (vedi `lib/imported.ts`). */
  async function remember(activityId: string): Promise<void> {
    const stored = await browser.storage.local.get(IMPORTED_KEY);
    await browser.storage.local.set({
      [IMPORTED_KEY]: withImported(readImported(stored[IMPORTED_KEY]), activityId, new Date()),
    });
  }

  async function readLesson(
    tabId: number,
    courseId: string,
    activityId: string,
  ): Promise<ReadActivityResponse> {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, READ_TIMEOUT_MS);
    });
    const reply: unknown = await Promise.race([
      browser.tabs
        .sendMessage(tabId, { type: 'sf/read-activity', courseId, activityId })
        .catch(() => null),
      timeout,
    ]);
    const parsed = readActivityResponse.safeParse(reply);
    return parsed.success
      ? parsed.data
      : {
          ok: false,
          fatal: true,
          error:
            'La scheda del portale non risponde: tienila aperta sul corso durante l’import e riprova.',
        };
  }

  async function loadTracks(tabId: number, videoId: string): Promise<PlayerTrack[] | null> {
    const received = new Promise<PlayerTrack[] | null>((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, PLAYER_TIMEOUT_MS);
      waiting.set(videoId, (tracks) => {
        clearTimeout(timer);
        resolve(tracks);
      });
    });
    try {
      await browser.tabs.sendMessage(tabId, { type: 'sf/mount-player', videoId });
      return await received;
    } catch {
      return null;
    } finally {
      waiting.delete(videoId);
      await browser.tabs
        .sendMessage(tabId, { type: 'sf/unmount-player', videoId })
        .catch(() => undefined);
    }
  }
});
