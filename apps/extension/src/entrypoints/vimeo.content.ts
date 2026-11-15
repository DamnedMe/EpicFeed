import { extractPlayerConfig, tracksFromConfig } from '../lib/player-config';

/**
 * Script nel player Vimeo. Agisce solo nei player caricati dall'estensione
 * (riconoscibili dal frammento `#sf-import`), mai in quello che il portale
 * mostra allo studente. Legge dalla configurazione del player l'elenco dei
 * sottotitoli e lo passa al service worker. Non avvia il video e non
 * interagisce con il player.
 */
export default defineContentScript({
  matches: ['https://player.vimeo.com/video/*'],
  allFrames: true,
  runAt: 'document_end',
  main() {
    if (window.location.hash !== '#sf-import') return;
    const videoId = /^\/video\/(\d{1,20})/.exec(window.location.pathname)?.[1];
    if (!videoId) return;

    const scripts = Array.from(document.scripts, (script) => script.textContent).join('\n');
    const tracks = tracksFromConfig(extractPlayerConfig(scripts));
    void browser.runtime.sendMessage({ type: 'sf/player-tracks', videoId, tracks });
  },
});
