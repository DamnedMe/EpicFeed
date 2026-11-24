import type {
  ImportSlidesRequest,
  ImportSlidesResponse,
  LessonSourcesResponse,
  LessonsToGenerateResponse,
  SaveLessonFeedRequest,
  OwnedLessonsResponse,
  SaveLessonFeedResponse,
} from '@epicfeed/feed';
import type {
  LessonForExamResponse,
  LessonsForExamResponse,
  SaveExamBankRequest,
  ExamCorrectionDraftRequest,
  SubmissionsResponse,
  SaveExamBankResponse,
  SubjectsForExamResponse,
  SaveExamPackRequest,
  SaveExamPackResponse,
} from '@epicfeed/contracts';
import { apiErrorSchema } from '@epicfeed/shared';
import {
  importSlidesResponseSchema,
  ownedLessonsResponseSchema,
  lessonSourcesResponseSchema,
  lessonsToGenerateResponseSchema,
  saveLessonFeedResponseSchema,
} from '@epicfeed/feed';
import {
  lessonForExamResponseSchema,
  lessonsForExamResponseSchema,
  saveExamBankResponseSchema,
  saveCorrectionResponseSchema,
  submissionsResponseSchema,
  saveExamPackResponseSchema,
  subjectsForExamResponseSchema,
} from '@epicfeed/contracts';
import type { z } from 'zod';

/** Problema puntuale restituito dall'API (feed non valido). */
export interface ApiIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Errore di una chiamata all'API di EpicFeed. Il messaggio è già pensato per
 * essere mostrato a Claude (e quindi allo studente): niente dettagli interni.
 */
export class ApiRequestError extends Error {
  /**
   * @param status - Codice HTTP (0 se la richiesta non è arrivata al server).
   * @param code - Codice stabile dell'errore (`UNAUTHORIZED`, `INVALID_FEED`…).
   * @param message - Messaggio leggibile.
   * @param issues - Problemi puntuali del feed, se presenti.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: readonly ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Configurazione del client. */
export interface EpicFeedApiOptions {
  /** Origine della web app, es. `https://study-feed-steel.vercel.app`. */
  readonly baseUrl: string;
  /** Token "genera" (`sfg_…`). */
  readonly token: string;
  /** Implementazione di `fetch`, sostituibile nei test. */
  readonly fetch?: typeof fetch;
  /** Tempo massimo di una richiesta. */
  readonly timeoutMs?: number;
}

/**
 * Client dell'API di generazione di EpicFeed, usato dal server MCP.
 *
 * - Il token viaggia solo nell'header `Authorization`, mai nell'URL, e solo
 *   verso l'origine configurata (HTTPS, o HTTP solo verso localhost).
 * - Ogni risposta è validata con gli schemi di `@epicfeed/contracts`: una
 *   risposta inattesa diventa un errore chiaro, non dati sbagliati per Claude.
 */
export class EpicFeedApi {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  /**
   * @param options - Origine, token e opzioni.
   * @throws Error se l'origine non è HTTPS (o HTTP verso localhost).
   */
  constructor(private readonly options: EpicFeedApiOptions) {
    this.baseUrl = new URL(options.baseUrl);
    const local = ['localhost', '127.0.0.1'].includes(this.baseUrl.hostname);
    if (this.baseUrl.protocol !== 'https:' && !(local && this.baseUrl.protocol === 'http:')) {
      throw new Error("L'indirizzo di EpicFeed deve usare HTTPS.");
    }
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  /**
   * Lezioni da generare e totali.
   *
   * @param limit - Massimo di lezioni (1–100).
   * @returns La risposta validata.
   */
  async listLessons(limit: number): Promise<LessonsToGenerateResponse> {
    return this.request(
      `/api/generation/lessons?limit=${String(limit)}`,
      { method: 'GET' },
      lessonsToGenerateResponseSchema,
    );
  }

  /**
   * Fonti di una lezione.
   *
   * @param lessonId - Id della lezione.
   * @returns La risposta validata.
   */
  async readLesson(lessonId: string): Promise<LessonSourcesResponse> {
    return this.request(
      `/api/generation/lessons/${encodeURIComponent(lessonId)}`,
      { method: 'GET' },
      lessonSourcesResponseSchema,
    );
  }

  /**
   * Salva il feed di una lezione.
   *
   * @param body - Richiesta già validata.
   * @returns La risposta validata.
   */
  async saveFeed(body: SaveLessonFeedRequest): Promise<SaveLessonFeedResponse> {
    return this.request(
      `/api/generation/lessons/${encodeURIComponent(body.lessonId)}/feed`,
      { method: 'POST', body: JSON.stringify(body) },
      saveLessonFeedResponseSchema,
    );
  }

  /**
   * Tutte le lezioni importate, con le slide già presenti.
   *
   * @returns La risposta validata.
   */
  async listCatalog(): Promise<OwnedLessonsResponse> {
    return this.request('/api/generation/catalog', { method: 'GET' }, ownedLessonsResponseSchema);
  }

  /**
   * Invia il testo delle slide di una lezione.
   *
   * @param lessonId - Id della lezione.
   * @param body - Presentazioni della lezione.
   * @returns La risposta validata.
   */
  async importSlides(lessonId: string, body: ImportSlidesRequest): Promise<ImportSlidesResponse> {
    return this.request(
      `/api/generation/lessons/${encodeURIComponent(lessonId)}/slides`,
      { method: 'POST', body: JSON.stringify(body) },
      importSlidesResponseSchema,
    );
  }

  /**
   * Lezioni con un feed ma senza pacchetto d'esame, e totali.
   *
   * @param limit - Massimo di lezioni (1–100).
   * @returns La risposta validata.
   */
  async listExamLessons(limit: number): Promise<LessonsForExamResponse> {
    return this.request(
      `/api/generation/exam?limit=${String(limit)}`,
      { method: 'GET' },
      lessonsForExamResponseSchema,
    );
  }

  /**
   * Feed di una lezione (in inglese) per scrivere il pacchetto d'esame.
   *
   * @param lessonId - Id della lezione.
   * @returns La risposta validata.
   */
  async readLessonForExam(lessonId: string): Promise<LessonForExamResponse> {
    return this.request(
      `/api/generation/lessons/${encodeURIComponent(lessonId)}/exam`,
      { method: 'GET' },
      lessonForExamResponseSchema,
    );
  }

  /**
   * Salva il pacchetto d'esame di una lezione.
   *
   * @param body - Richiesta già validata.
   * @returns La risposta validata.
   */
  async saveExamPack(body: SaveExamPackRequest): Promise<SaveExamPackResponse> {
    return this.request(
      `/api/generation/lessons/${encodeURIComponent(body.lessonId)}/exam`,
      { method: 'POST', body: JSON.stringify(body) },
      saveExamPackResponseSchema,
    );
  }

  /**
   * Materie con almeno un feed, con i concetti, per la banca d'esame.
   *
   * @returns La risposta validata.
   */
  async listExamSubjects(): Promise<SubjectsForExamResponse> {
    return this.request(
      '/api/generation/exam/subjects',
      { method: 'GET' },
      subjectsForExamResponseSchema,
    );
  }

  /**
   * Salva la banca degli esercizi d'esame di una materia.
   *
   * @param body - Richiesta già validata.
   * @returns La risposta validata.
   */
  async saveExamBank(body: SaveExamBankRequest): Promise<SaveExamBankResponse> {
    return this.request(
      `/api/generation/exam/subjects/${encodeURIComponent(body.subjectId)}/bank`,
      { method: 'POST', body: JSON.stringify(body) },
      saveExamBankResponseSchema,
    );
  }

  /**
   * Risposte dello studente in attesa della correzione di Claude.
   *
   * @returns La risposta validata.
   */
  async listSubmissionsToCorrect(): Promise<SubmissionsResponse> {
    return this.request(
      '/api/generation/exam/submissions',
      { method: 'GET' },
      submissionsResponseSchema,
    );
  }

  /**
   * Salva la correzione di un invio.
   *
   * @param id - Id dell'invio.
   * @param correction - Correzione già validata.
   */
  async saveCorrection(id: string, correction: ExamCorrectionDraftRequest): Promise<void> {
    await this.request(
      `/api/generation/exam/submissions/${encodeURIComponent(id)}/correction`,
      { method: 'POST', body: JSON.stringify({ correction }) },
      saveCorrectionResponseSchema,
    );
  }

  private async request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          authorization: `Bearer ${this.options.token}`,
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ApiRequestError(
        0,
        'NETWORK',
        'EpicFeed non risponde: controlla la connessione a internet e riprova.',
      );
    }

    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(json);
      if (parsed.success) {
        const { code, message, issues } = parsed.data.error;
        throw new ApiRequestError(response.status, code, message, issues ?? []);
      }
      throw new ApiRequestError(
        response.status,
        'HTTP',
        `EpicFeed ha risposto ${String(response.status)}.`,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiRequestError(
        response.status,
        'BAD_RESPONSE',
        'Risposta inattesa da EpicFeed: forse il server MCP va aggiornato.',
      );
    }
    return parsed.data;
  }
}
