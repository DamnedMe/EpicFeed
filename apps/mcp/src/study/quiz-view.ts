import { readFile } from 'node:fs/promises';

/**
 * Pagina della scheda del quiz (app MCP, risorsa `ui://`). La costruisce
 * `scripts/build-view.mjs` da `view/quiz/` e la mette accanto al server nel
 * pacchetto (`server/quiz-view.html`): qui si legge dal disco una volta.
 */

/** Indirizzo della risorsa che Claude Desktop mostra nella chat. */
export const QUIZ_VIEW_URI = 'ui://epicfeed/quiz.html';

/** Fonte della pagina (sostituibile nei test). */
export type QuizViewSource = () => Promise<string>;

/** Pagina di riserva se il file manca (es. server avviato senza pacchetto). */
export const QUIZ_VIEW_FALLBACK = `<!doctype html><html lang="it"><meta charset="utf-8"><body style="font:14px system-ui;background:#0B0B0E;color:#DCE3EA;padding:16px">La scheda del quiz non è disponibile: rispondi alle domande in chat.</body></html>`;

/**
 * Legge la pagina accanto al modulo, una volta sola.
 *
 * @param url - Dove cercarla (accanto a `index.js` nel pacchetto).
 * @returns La fonte della pagina; se il file non c'è, la pagina di riserva.
 */
export function fileQuizView(url = new URL('./quiz-view.html', import.meta.url)): QuizViewSource {
  let cached: Promise<string> | null = null;
  return () => {
    if (!cached) cached = readFile(url, 'utf8').catch(() => QUIZ_VIEW_FALLBACK);
    return cached;
  };
}
