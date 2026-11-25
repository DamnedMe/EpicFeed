import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CORRECTION_SERVER_INSTRUCTIONS } from './exam/correction-prompt.js';
import type { CorrectionApi } from './exam/correction-tools.js';
import { registerCorrectionTools } from './exam/correction-tools.js';
import { EXAM_SERVER_INSTRUCTIONS } from './exam/prompt.js';
import type { ExamBankApi } from './exam/bank-tools.js';
import { registerExamBankTools } from './exam/bank-tools.js';
import type { ExamApi } from './exam/pack-tools.js';
import { registerExamTools } from './exam/pack-tools.js';
import type { FeedApi } from './feed/tools.js';
import { registerFeedTools } from './feed/tools.js';
import { REPORT_SERVER_INSTRUCTIONS } from './feed/report-prompt.js';
import type { ReportApi } from './feed/report-tools.js';
import { registerReportTools } from './feed/report-tools.js';
import { SERVER_INSTRUCTIONS } from './feed/prompt.js';
import type { SlidesToolkit } from './feed/slides/toolkit.js';
import { defaultSlidesToolkit } from './feed/slides/toolkit.js';

/** Versione del server MCP, mostrata a Claude Desktop. */
export const SERVER_VERSION = '0.1.0';

/** Operazioni dell'API usate dagli strumenti (sostituibili nei test). */
export type GenerationApi = FeedApi & ExamApi & ExamBankApi & CorrectionApi & ReportApi;

/**
 * Crea il server MCP di EpicFeed con gli strumenti di generazione del feed
 * (M2, {@link registerFeedTools}); più quelli dei pacchetti d'esame e della banca degli esercizi (M4,
 * {@link registerExamTools}, {@link registerExamBankTools}) e della
 * correzione delle risposte ({@link registerCorrectionTools}); e quelli di
 * *Segnala errore* (M5, {@link registerReportTools}).
 *
 * Il server non tiene segreti oltre al token (dentro `api`).
 *
 * @param api - Client dell'API di EpicFeed.
 * @param slides - Operazioni sui PDF delle slide (sostituibili nei test).
 * @returns Il server, da collegare a un trasporto (stdio in produzione).
 */
export function createEpicFeedServer(
  api: GenerationApi,
  slides: SlidesToolkit = defaultSlidesToolkit(),
): McpServer {
  const server = new McpServer(
    { name: 'epicfeed', title: 'EpicFeed', version: SERVER_VERSION },
    {
      instructions: `${SERVER_INSTRUCTIONS}\n${REPORT_SERVER_INSTRUCTIONS}\n\n${EXAM_SERVER_INSTRUCTIONS}\n${CORRECTION_SERVER_INSTRUCTIONS}`,
    },
  );
  registerFeedTools(server, api, slides);
  registerExamTools(server, api);
  registerExamBankTools(server, api, slides);
  registerCorrectionTools(server, api);
  registerReportTools(server, api);
  return server;
}
