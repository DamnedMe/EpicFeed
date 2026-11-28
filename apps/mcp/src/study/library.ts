import type { StudySubjectsResponse, SubjectFeedResponse } from '@epicfeed/feed';
import type { EpicFeedApi } from '../api-client.js';

/** Operazioni dell'API usate dall'assistente di studio (sostituibili nei test). */
export type StudyLibraryApi = Pick<EpicFeedApi, 'listStudySubjects' | 'readStudySubject'>;

/** Materia scaricata, nella forma dell'API. */
export type SubjectFeed = SubjectFeedResponse;
/** Materia nell'elenco. */
export type StudySubjectSummary = StudySubjectsResponse['subjects'][number];

/**
 * Quanto restano valide in memoria materie e feed: una conversazione di
 * studio fa molte domande di fila, e così il server MCP chiede a EpicFeed
 * una materia una volta sola invece che a ogni strumento.
 */
export const LIBRARY_TTL_MS = 5 * 60 * 1000;

interface Cached<T> {
  readonly value: T;
  readonly at: number;
}

/**
 * Le materie dello studente come le scarica la web app (M6, ADR 0021), tenute
 * in memoria per qualche minuto. Cerca lezione, concetti deboli e quiz
 * lavorano su questi dati sul PC: il server di EpicFeed non fa ricerche.
 */
export class StudyLibrary {
  private subjectsCache: Cached<StudySubjectSummary[]> | null = null;
  private readonly feeds = new Map<string, Cached<SubjectFeed>>();

  /**
   * @param api - Client dell'API.
   * @param now - Orologio in millisecondi (test).
   */
  constructor(
    private readonly api: StudyLibraryApi,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Materie con lezioni importate.
   *
   * @returns Le materie, dalla memoria se recenti.
   */
  async subjects(): Promise<StudySubjectSummary[]> {
    if (this.subjectsCache && this.fresh(this.subjectsCache)) return this.subjectsCache.value;
    const { subjects } = await this.api.listStudySubjects();
    this.subjectsCache = { value: subjects, at: this.now() };
    return subjects;
  }

  /**
   * Feed di una materia.
   *
   * @param subjectId - Id della materia.
   * @returns Il feed, dalla memoria se recente.
   */
  async feed(subjectId: string): Promise<SubjectFeed> {
    const key = subjectId.toLowerCase();
    const cached = this.feeds.get(key);
    if (cached && this.fresh(cached)) return cached.value;
    const value = await this.api.readStudySubject(key);
    this.feeds.set(key, { value, at: this.now() });
    return value;
  }

  /**
   * Feed delle materie scelte: quella indicata (per id o per una parte del
   * titolo), oppure tutte quelle con almeno una lezione generata.
   *
   * @param subject - Id o parte del titolo della materia; vuoto per tutte.
   * @returns I feed trovati (vuoto se nessuna materia corrisponde).
   */
  async feedsFor(subject?: string): Promise<SubjectFeed[]> {
    const subjects = (await this.subjects()).filter((item) => item.lessonsWithFeed > 0);
    const wanted = subject?.trim().toLowerCase() ?? '';
    const chosen =
      wanted === ''
        ? subjects
        : subjects.filter(
            (item) => item.subjectId === wanted || item.title.toLowerCase().includes(wanted),
          );
    return Promise.all(chosen.map((item) => this.feed(item.subjectId)));
  }

  /** Dimentica la materia dopo una modifica (es. una correzione salvata). */
  forget(subjectId: string): void {
    this.feeds.delete(subjectId.toLowerCase());
  }

  private fresh(entry: Cached<unknown>): boolean {
    return this.now() - entry.at < LIBRARY_TTL_MS;
  }
}
