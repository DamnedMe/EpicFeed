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
import type { StudyLibraryApi } from './study/library.js';
import { StudyLibrary } from './study/library.js';
import type { ProgressApi, ProgressCredentials } from './study/progress.js';
import { ProgressReader } from './study/progress.js';
import { STUDY_SERVER_INSTRUCTIONS } from './study/prompt.js';
import type { StudyApi } from './study/tools.js';
import { registerStudyTools } from './study/tools.js';
import type { SlidesToolkit } from './feed/slides/toolkit.js';
import { defaultSlidesToolkit } from './feed/slides/toolkit.js';

/** Versione del server MCP, mostrata a Claude Desktop. */
export const SERVER_VERSION = '0.1.0';

/** Operazioni dell'API usate dagli strumenti (sostituibili nei test). */
export type GenerationApi = FeedApi &
  ExamApi &
  ExamBankApi &
  CorrectionApi &
  ReportApi &
  StudyApi &
  StudyLibraryApi &
  ProgressApi;

/**
 * Crea il server MCP di EpicFeed con gli strumenti di generazione del feed
 * (M2, {@link registerFeedTools}); più quelli dei pacchetti d'esame e della banca degli esercizi (M4,
 * {@link registerExamTools}, {@link registerExamBankTools}) e della
 * correzione delle risposte ({@link registerCorrectionTools}); quelli di
 * *Segnala errore* (M5, {@link registerReportTools}); e quelli
 * dell'assistente di studio (M6, {@link registerStudyTools}).
 *
 * Il server tiene in memoria il token (dentro `api`) e, se lo studente le ha
 * impostate, email e password per aprire sul PC la copia cifrata dei
 * progressi: non le invia mai.
 *
 * @param api - Client dell'API di EpicFeed.
 * @param slides - Operazioni sui PDF delle slide (sostituibili nei test).
 * @param credentials - Email e password di EpicFeed, oppure `null`.
 * @returns Il server, da collegare a un trasporto (stdio in produzione).
 */
export function createEpicFeedServer(
  api: GenerationApi,
  slides: SlidesToolkit = defaultSlidesToolkit(),
  credentials: ProgressCredentials | null = null,
): McpServer {
  const server = new McpServer(
    { name: 'epicfeed', title: 'EpicFeed', version: SERVER_VERSION },
    {
      instructions: `${SERVER_INSTRUCTIONS}\n${REPORT_SERVER_INSTRUCTIONS}\n\n${EXAM_SERVER_INSTRUCTIONS}\n${CORRECTION_SERVER_INSTRUCTIONS}\n\n${STUDY_SERVER_INSTRUCTIONS}`,
    },
  );
  registerFeedTools(server, api, slides);
  registerExamTools(server, api);
  registerExamBankTools(server, api, slides);
  registerCorrectionTools(server, api);
  registerReportTools(server, api);
  registerStudyTools(server, {
    api,
    library: new StudyLibrary(api),
    progress: new ProgressReader(api, credentials),
  });
  return server;
}
