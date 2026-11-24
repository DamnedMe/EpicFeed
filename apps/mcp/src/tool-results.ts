import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { FeedIssue } from '@study-feed/core';
import { ApiRequestError } from './api-client.js';

/**
 * Risultati degli strumenti MCP comuni a feed e pacchetti d'esame: testo,
 * elenco dei problemi da correggere, errori dell'API in parole per Claude.
 */

/**
 * Risultato di solo testo.
 *
 * @param value - Testo per Claude.
 * @returns Il risultato.
 */
export function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

/**
 * Problemi da correggere prima di salvare di nuovo.
 *
 * @param issues - Problemi trovati dal core o dall'API.
 * @param tool - Strumento da richiamare dopo la correzione.
 * @returns Il risultato, marcato come errore.
 */
export function issuesResult(
  issues: readonly FeedIssue[],
  tool = 'salva_feed_lezione',
): CallToolResult {
  const list = issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n');
  const what = tool === 'salva_feed_lezione' ? 'Il feed' : 'Il pacchetto';
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `${what} non è stato salvato: ${String(issues.length)} problemi da correggere.\n${list}\nCorreggi solo questi punti e chiama di nuovo ${tool}.`,
      },
    ],
  };
}

/**
 * Esegue uno strumento trasformando gli errori dell'API in risultati
 * leggibili per Claude.
 *
 * @param work - Lavoro dello strumento.
 * @param tool - Strumento di salvataggio da richiamare dopo una correzione.
 * @returns Il risultato dello strumento o dell'errore.
 */
export async function withErrors(
  work: () => Promise<CallToolResult>,
  tool = 'salva_feed_lezione',
): Promise<CallToolResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.issues.length > 0) return issuesResult(error.issues, tool);
      const reread =
        tool === 'salva_feed_lezione'
          ? ' Chiama di nuovo leggi_lezione e rigenera il feed dalle fonti aggiornate.'
          : ' Chiama di nuovo leggi_lezione_esame e riscrivi il pacchetto sul feed aggiornato.';
      const hint =
        error.code === 'UNAUTHORIZED'
          ? ' Crea un nuovo token nella pagina Claude Desktop di EpicFeed e incollalo nelle impostazioni dell’estensione.'
          : error.code === 'CONFLICT'
            ? reread
            : '';
      return { isError: true, content: [{ type: 'text', text: `${error.message}${hint}` }] };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: 'Errore inatteso nel server MCP di EpicFeed.' }],
    };
  }
}
