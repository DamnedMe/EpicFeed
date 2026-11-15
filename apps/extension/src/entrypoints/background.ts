import { acceptConnection, usableConnection } from '../lib/connection';
import { runImportJob } from '../lib/import-job';
import { playerTracksMessage, startImportMessage, type ImportStatus } from '../lib/messages';
import { APP_ORIGINS } from '../lib/origins';
import type { PlayerTrack } from '../lib/player-config';

/** Tempo massimo di attesa delle tracce da un player. */
const PLAYER_TIMEOUT_MS = 20_000;

/**
 * Service worker dell'estensione:
 * - riceve dalla web app il collegamento (token di import);
 * - coordina l'import avviato dal popup: player nascosti uno alla volta,
 *   download dei sottotitoli, invio a Study Feed;
 * - scrive lo stato in `storage.session`, da cui lo legge il popup.
 */
export default defineBackground(() => {
  const waiting = new Map<string, (tracks: PlayerTrack[]) => void>();
  let running = false;

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

    const start = startImportMessage.safeParse(message);
    if (start.success) {
      if (running) {
        sendResponse({ ok: false, error: 'Un import è già in corso.' });
        return undefined;
      }
      void startImport(start.data.tabId, start.data.preview).then(sendResponse);
      return true;
    }
    return undefined;
  });

  async function startImport(
    tabId: number,
    preview: Parameters<typeof runImportJob>[0],
  ): Promise<{ ok: boolean; error?: string }> {
    const stored = await browser.storage.local.get('connection');
    const connection = usableConnection(stored.connection);
    if (!connection) return { ok: false, error: 'Collega prima l’estensione dalla web app.' };

    running = true;
    void runImportJob(preview, connection, {
      loadTracks: (videoId) => loadTracks(tabId, videoId),
      fetchText: async (url) => {
        if (new URL(url).hostname !== 'captions.vimeo.com') throw new Error('host non ammesso');
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      },
      pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      report: (status: ImportStatus) => browser.storage.session.set({ importStatus: status }),
      fetch: (input, init) => fetch(input, init),
    }).finally(() => {
      running = false;
    });
    return { ok: true };
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
