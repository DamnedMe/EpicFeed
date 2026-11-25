import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StoredSubmissionResponse } from '@epicfeed/exam';
import { examCorrectionSchema, checkCorrection } from '@epicfeed/exam';
import * as z from 'zod';
import type { EpicFeedApi } from '../api-client.js';
import { CORRECTION_INSTRUCTIONS } from './correction-prompt.js';
import { issuesResult, text, withErrors } from '../tool-results.js';

/** Operazioni dell'API usate dalla correzione (sostituibili nei test). */
export type CorrectionApi = Pick<EpicFeedApi, 'listSubmissionsToCorrect' | 'saveCorrection'>;

/** Strumento da richiamare dopo aver sistemato una correzione. */
const SAVE_TOOL = 'salva_correzione';

/** Invii mostrati a Claude in una volta: gli altri al giro successivo. */
export const MAX_SUBMISSIONS_PER_CALL = 5;

/**
 * Registra gli strumenti della correzione di Claude (M4, ADR 0014 §4):
 * `risposte_da_correggere`, `salva_correzione` e il prompt `correggi_risposte`.
 *
 * Il server ricorda in memoria gli invii letti e controlla la correzione con
 * le regole del dominio (punti entro la griglia, righe esistenti) prima di
 * inviarla.
 *
 * @param server - Server MCP di EpicFeed.
 * @param api - Client dell'API.
 */
export function registerCorrectionTools(server: McpServer, api: CorrectionApi): void {
  const read = new Map<string, StoredSubmissionResponse>();

  server.registerTool(
    'risposte_da_correggere',
    {
      title: 'Risposte da correggere',
      description:
        "Elenca le risposte d'esame che lo studente ha inviato da EpicFeed per la correzione (esercizi e colloqui simulati), con consegna, risposta numerata per righe, soluzione modello e griglia, più le istruzioni per correggerle. Da chiamare prima di salva_correzione.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      withErrors(async () => {
        const { submissions } = await api.listSubmissionsToCorrect();
        if (submissions.length === 0) {
          return text(
            'Non ci sono risposte da correggere. Lo studente le invia dalla sezione Esame con «Fai correggere a Claude».',
          );
        }
        const shown = submissions.slice(0, MAX_SUBMISSIONS_PER_CALL);
        for (const submission of shown) read.set(submission.id, submission);
        const parts = shown.map(formatSubmission);
        if (submissions.length > shown.length) {
          parts.push(
            `… e altri ${String(submissions.length - shown.length)} invii: richiama lo strumento dopo aver salvato queste correzioni.`,
          );
        }
        parts.push(CORRECTION_INSTRUCTIONS);
        return { content: parts.map((value) => ({ type: 'text' as const, text: value })) };
      }, SAVE_TOOL),
  );

  server.registerTool(
    'salva_correzione',
    {
      title: 'Salva correzione',
      description:
        'Salva in EpicFeed la correzione di un invio: punti per criterio, commento e suggerimenti sulle righe della risposta (stile revisione del codice), più un riepilogo. Controlla la correzione prima di inviarla: se ci sono problemi li elenca.',
      inputSchema: {
        id: z.uuid().describe("Id dell'invio, da risposte_da_correggere."),
        correction: examCorrectionSchema.describe('La correzione, in inglese.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, correction }) =>
      withErrors(async () => {
        const key = id.toLowerCase();
        const submission = read.get(key);
        if (submission) {
          const issues = checkCorrection(correction, submission.submission);
          if (issues.length > 0) return issuesResult(issues, SAVE_TOOL);
        }
        await api.saveCorrection(key, correction);
        read.delete(key);
        return text(
          'Correzione salvata: lo studente la vede alla prossima apertura della sezione Esame.',
        );
      }, SAVE_TOOL),
  );

  server.registerPrompt(
    'correggi_risposte',
    {
      title: 'Correggi le risposte',
      description:
        "Corregge in inglese le risposte d'esame inviate da EpicFeed, con suggerimenti sulle righe del codice.",
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Correggi le mie risposte d'esame di EpicFeed in attesa, un invio alla volta, con gli strumenti di EpicFeed.\n\n${CORRECTION_INSTRUCTIONS}`,
          },
        },
      ],
    }),
  );
}

/**
 * Invio in testo leggibile per Claude, con la risposta numerata per righe
 * (i suggerimenti si riferiscono a quei numeri).
 *
 * @param stored - Invio salvato.
 * @returns Il testo.
 */
export function formatSubmission(stored: StoredSubmissionResponse): string {
  const label = stored.kind === 'interview' ? 'Colloquio simulato' : 'Esercizio';
  const out = [`# ${label} — id: ${stored.id}`];
  stored.submission.items.forEach((item, index) => {
    out.push('', `## Domanda ${String(index + 1)} — key: ${item.key} (${item.kind})`, item.prompt);
    if (item.code !== null) out.push('', 'Codice dato:', '```', item.code, '```');
    out.push('', 'Risposta dello studente (righe numerate):', numbered(item.answer));
    if (item.tests) {
      out.push(
        `Test nel browser: ${String(item.tests.passed)} su ${String(item.tests.total)} superati.`,
      );
    }
    if (item.followUp !== null) {
      out.push(
        '',
        `Approfondimento: ${item.followUp}`,
        `Risposta: ${item.followUpAnswer ?? '(nessuna)'}`,
      );
    }
    out.push('', 'Soluzione modello:', item.modelAnswer, '', 'Griglia (scores in questo ordine):');
    out.push(
      ...item.rubric.map((c, i) => `${String(i + 1)}. ${c.criterion} — ${String(c.points)} punti`),
    );
  });
  return out.join('\n');
}

/** Testo con il numero di riga davanti a ogni riga (`  3 | ...`). */
function numbered(answer: string): string {
  const lines = answer.split('\n');
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width)} | ${line}`).join('\n');
}
