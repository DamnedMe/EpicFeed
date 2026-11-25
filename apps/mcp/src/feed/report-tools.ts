import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StoredCorrection } from '@epicfeed/feed';
import { checkCompletion, correctionCompletionSchema } from '@epicfeed/feed';
import * as z from 'zod';
import type { EpicFeedApi } from '../api-client.js';
import { issuesResult, text, withErrors } from '../tool-results.js';
import { REPORT_INSTRUCTIONS } from './report-prompt.js';

/** Operazioni dell'API usate dalle segnalazioni (sostituibili nei test). */
export type ReportApi = Pick<EpicFeedApi, 'listPendingReports' | 'completeReport'>;

/** Strumento da richiamare dopo aver sistemato un esito. */
const COMPLETE_TOOL = 'completa_segnalazione';

/** Segnalazioni mostrate a Claude in una volta: le altre al giro successivo. */
export const MAX_REPORTS_PER_CALL = 5;

/**
 * Registra gli strumenti di *Segnala errore* per Claude Desktop (M5,
 * ADR 0020 §2): `segnalazioni_in_attesa`, `completa_segnalazione` e il prompt
 * `sistema_segnalazioni`.
 *
 * Il server ricorda in memoria le segnalazioni lette e controlla l'esito con
 * le regole del dominio (`checkCompletion`) prima di inviarlo.
 *
 * @param server - Server MCP di EpicFeed.
 * @param api - Client dell'API.
 */
export function registerReportTools(server: McpServer, api: ReportApi): void {
  const read = new Map<string, StoredCorrection>();

  server.registerTool(
    'segnalazioni_in_attesa',
    {
      title: 'Segnalazioni in attesa',
      description:
        "Elenca le correzioni che lo studente ha fatto con Segnala errore e che aspettano Claude: frasi da allineare nell'altra lingua e schede o domande da rifare dai riassunti, con l'elemento come lo vedeva lo studente e le istruzioni. Da chiamare prima di completa_segnalazione.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      withErrors(async () => {
        const { corrections } = await api.listPendingReports();
        if (corrections.length === 0) {
          return text(
            'Non ci sono segnalazioni in attesa. Lo studente le crea nel feed: tieni premuto su una scheda o una domanda, poi Segnala errore.',
          );
        }
        const shown = corrections.slice(0, MAX_REPORTS_PER_CALL);
        for (const report of shown) read.set(report.id, report);
        const parts = shown.map(formatReport);
        if (corrections.length > shown.length) {
          parts.push(
            `… e altre ${String(corrections.length - shown.length)} segnalazioni: richiama lo strumento dopo aver completato queste.`,
          );
        }
        parts.push(REPORT_INSTRUCTIONS);
        return { content: parts.map((value) => ({ type: 'text' as const, text: value })) };
      }, COMPLETE_TOOL),
  );

  server.registerTool(
    COMPLETE_TOOL,
    {
      title: 'Completa segnalazione',
      description:
        "Salva in EpicFeed il lavoro su una segnalazione: gli interventi (la frase nell'altra lingua o l'elemento rifatto) oppure, se i riassunti la contraddicono, una nota da ricontrollare. Controlla l'esito prima di inviarlo: se ci sono problemi li elenca.",
      inputSchema: {
        id: z.uuid().describe('Id della segnalazione, da segnalazioni_in_attesa.'),
        completion: correctionCompletionSchema.describe(
          'outcome "done" con edits, oppure outcome "disputed" con note ed evidence.',
        ),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, completion }) =>
      withErrors(async () => {
        const key = id.toLowerCase();
        const report = read.get(key);
        if (report) {
          const issues = checkCompletion(report.correction, completion);
          if (issues.length > 0) return issuesResult(issues, COMPLETE_TOOL);
        }
        await api.completeReport(key, completion);
        read.delete(key);
        return text(
          completion.outcome === 'done'
            ? 'Segnalazione completata: lo studente vede la correzione alla prossima apertura del feed.'
            : 'Segnalazione salvata come da ricontrollare: lo studente vede la tua nota in Le mie segnalazioni.',
        );
      }, COMPLETE_TOOL),
  );

  server.registerPrompt(
    'sistema_segnalazioni',
    {
      title: 'Sistema le segnalazioni',
      description:
        "Completa le correzioni fatte con Segnala errore: allinea l'altra lingua e rifà le schede segnalate, verificando con i riassunti.",
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Sistema le mie segnalazioni di EpicFeed in attesa, una alla volta, con gli strumenti di EpicFeed.\n\n${REPORT_INSTRUCTIONS}`,
          },
        },
      ],
    }),
  );
}

const KIND_LABEL: Record<'text' | 'regenerate', string> = {
  text: "Frase corretta: allinea l'altra lingua",
  regenerate: 'Da rifare dai riassunti',
};

const REASON_LABEL: Record<StoredCorrection['correction']['reason'], string> = {
  content: 'contenuto sbagliato',
  translation: 'traduzione',
  code: 'codice',
  unclear: 'poco chiaro',
};

/**
 * Segnalazione in testo leggibile per Claude, con l'elemento come lo vedeva
 * lo studente (gli `original` degli interventi vanno presi da lì).
 *
 * @param stored - Segnalazione salvata.
 * @returns Il testo.
 */
export function formatReport(stored: StoredCorrection): string {
  const draft = stored.correction;
  // Le correzioni senza lavoro di Claude (risposte, termini) non arrivano qui.
  if (draft.kind !== 'text' && draft.kind !== 'regenerate') {
    return `# Segnalazione — id: ${stored.id}\nNon serve nulla: salta.`;
  }
  const out = [
    `# ${KIND_LABEL[draft.kind]} — id: ${stored.id}`,
    `lessonId: ${draft.lessonId} · ${draft.itemType === 'card' ? 'scheda' : 'domanda'} ${draft.itemId} · motivo: ${REASON_LABEL[draft.reason]}`,
  ];
  if (draft.kind === 'text') {
    out.push('', 'Correzioni dello studente:');
    for (const edit of draft.edits) {
      const where = edit.index === undefined ? edit.field : `${edit.field}[${String(edit.index)}]`;
      out.push(`- ${where} (${edit.language}): «${edit.original}» → «${edit.corrected}»`);
    }
  }
  out.push('', 'Elemento come lo vedeva lo studente:', '```json');
  out.push(JSON.stringify(draft.snapshot, null, 2), '```');
  return out.join('\n');
}
