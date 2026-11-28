import { generateTokenSchema } from '@epicfeed/feed';
import { ApiRequestError, EpicFeedApi } from './api-client.js';
import type { GenerationApi } from './server.js';
import type { ProgressCredentials } from './study/progress.js';

/** Indirizzo predefinito della web app EpicFeed. */
export const DEFAULT_API_URL = 'https://study-feed-steel.vercel.app';

/**
 * Crea il client dell'API dalle variabili d'ambiente che Claude Desktop passa
 * al server (dalle impostazioni dell'estensione, `manifest.json`):
 * `EPICFEED_TOKEN` (segreto, nel portachiavi del sistema) ed `EPICFEED_API_URL`.
 *
 * Se il token manca o non è valido il server parte comunque, ma ogni
 * strumento risponde con le istruzioni per configurarlo: è più chiaro per lo
 * studente di un server che non si avvia.
 *
 * @param env - Variabili d'ambiente.
 * @param fetchImpl - Implementazione di `fetch` (test).
 * @returns Il client da passare a `createEpicFeedServer`.
 */
export function apiFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof fetch,
): GenerationApi {
  const token = generateTokenSchema.safeParse(env.EPICFEED_TOKEN?.trim());
  // Un segnaposto non sostituito (`${user_config.api_url}`) vale come assente.
  const configured = env.EPICFEED_API_URL?.trim() ?? '';
  const baseUrl = configured === '' || configured.startsWith('${') ? DEFAULT_API_URL : configured;
  if (!token.success) return missingTokenApi();
  return new EpicFeedApi({
    baseUrl,
    token: token.data,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

function missingTokenApi(): GenerationApi {
  const fail = (): Promise<never> =>
    Promise.reject(
      new ApiRequestError(
        401,
        'UNAUTHORIZED',
        'Token di EpicFeed mancante o non valido (deve iniziare con sfg_).',
      ),
    );
  return {
    listLessons: fail,
    readLesson: fail,
    saveFeed: fail,
    listCatalog: fail,
    importSlides: fail,
    listExamLessons: fail,
    readLessonForExam: fail,
    saveExamPack: fail,
    listExamSubjects: fail,
    saveExamBank: fail,
    listSubmissionsToCorrect: fail,
    saveCorrection: fail,
    listPendingReports: fail,
    completeReport: fail,
    listStudySubjects: fail,
    readStudySubject: fail,
    readProgress: fail,
    writeProgress: fail,
    reportError: fail,
  };
}

/**
 * Email e password di EpicFeed dalle impostazioni dell'estensione
 * (`EPICFEED_EMAIL`, `EPICFEED_PASSWORD`; la password è nel portachiavi del
 * sistema). Servono solo ad aprire sul PC la copia cifrata dei progressi.
 *
 * @param env - Variabili d'ambiente.
 * @returns Le credenziali, oppure `null` se mancano (gli strumenti lo spiegano).
 */
export function credentialsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): ProgressCredentials | null {
  // Un segnaposto non sostituito (`${user_config.…}`) vale come assente.
  const value = (raw: string | undefined) => {
    const trimmed = raw?.trim() ?? '';
    return trimmed === '' || trimmed.startsWith('${') ? null : trimmed;
  };
  const email = value(env.EPICFEED_EMAIL);
  // La password non si accorcia: gli spazi ai lati possono farne parte.
  const password = env.EPICFEED_PASSWORD;
  if (!email || !email.includes('@') || !password || password.startsWith('${')) return null;
  return { email, password };
}
