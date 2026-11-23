import type {
  ChapterId,
  ContentHash,
  LessonFeedDocument,
  LessonId,
  LessonPartId,
  LessonPartKind,
  Sha256,
  StoredFeedCard,
  UserId,
} from '../domain/index.js';
import {
  ALIGNMENT_VERSION,
  DomainError,
  computeLessonSourcesHash,
  portalContentUrl,
  webCryptoSha256,
} from '../domain/index.js';
import type { GenerationRepository } from './generation.js';
import { alignFeedCards } from './generation.js';

/**
 * Casi d'uso del feed di studio (M3, ADR 0015): le materie dello studente, il
 * feed di una materia da scaricare tutto sul telefono e il riallineamento dei
 * feed salvati quando cambiano le regole dei minuti.
 *
 * Le letture passano sempre dai permessi dello studente: vede solo le lezioni
 * e i feed delle parti che ha importato.
 */

/** Materia con lezioni importate dallo studente. */
export interface StudySubject {
  readonly subjectId: string;
  readonly title: string;
  readonly editionLabel: string;
  readonly lessons: number;
  /** Lezioni con un feed pronto da studiare. */
  readonly lessonsWithFeed: number;
}

/** Parte di una lezione come la vede il feed (per "Fonte" e "Guarda sul portale"). */
export interface StudyFeedPart {
  readonly partId: LessonPartId;
  readonly epicodeId: string;
  readonly title: string;
  readonly kind: LessonPartKind;
  readonly position: number;
}

/** Riga di lezione letta dal repository, con il feed più recente visibile. */
export interface StudyFeedLessonRow {
  readonly lessonId: LessonId;
  readonly epicodeId: string;
  readonly title: string;
  readonly position: number;
  readonly chapterId: ChapterId;
  readonly chapterTitle: string;
  readonly chapterPosition: number;
  readonly parts: readonly StudyFeedPart[];
  readonly feed: { readonly feedId: string; readonly document: LessonFeedDocument } | null;
}

/** Materia con le sue lezioni, letta dal repository. */
export interface StudyFeedSubjectRows {
  readonly subjectId: string;
  readonly epicodeId: string;
  readonly title: string;
  /** Lezioni in ordine di capitolo e posizione. */
  readonly lessons: readonly StudyFeedLessonRow[];
}

/** Persistenza del feed di studio. */
export interface StudyFeedRepository {
  /**
   * Elenca le materie in cui lo studente ha importato almeno una lezione.
   *
   * @param userId - Studente.
   * @returns Le materie in ordine di edizione e posizione.
   */
  listSubjects(userId: UserId): Promise<StudySubject[]>;

  /**
   * Carica le lezioni di una materia visibili allo studente, ciascuna con il
   * feed più recente tra quelli che può vedere.
   *
   * @param userId - Studente.
   * @param subjectId - Materia.
   * @returns La materia, oppure `null` se lo studente non ne vede nessuna lezione.
   */
  loadSubjectFeeds(userId: UserId, subjectId: string): Promise<StudyFeedSubjectRows | null>;

  /**
   * Sostituisce le schede di un feed con quelle riallineate, solo se il feed è
   * ancora alla versione di allineamento letta (nessuna scrittura doppia se due
   * richieste riallineano insieme).
   *
   * @param feedId - Feed.
   * @param cards - Schede riallineate.
   * @param version - Nuova versione di allineamento.
   * @param previousVersion - Versione letta (1 se il campo mancava).
   * @returns `true` se il feed è stato aggiornato.
   */
  updateFeedAlignment(
    feedId: string,
    cards: readonly StoredFeedCard[],
    version: number,
    previousVersion: number,
  ): Promise<boolean>;
}

/** Lezione nel feed di una materia, pronta per la web app. */
export interface StudyFeedLesson {
  readonly lessonId: LessonId;
  readonly title: string;
  readonly position: number;
  /** Pagina della lezione sul portale. */
  readonly portalUrl: string;
  readonly parts: readonly (StudyFeedPart & { readonly portalUrl: string })[];
  /** Feed da studiare, oppure `null` se la lezione non è ancora stata generata. */
  readonly feed: LessonFeedDocument | null;
}

/** Capitolo della materia con le sue lezioni. */
export interface StudyFeedChapter {
  readonly chapterId: ChapterId;
  readonly title: string;
  readonly lessons: readonly StudyFeedLesson[];
}

/** Feed completo di una materia: si scarica una volta e si studia anche offline. */
export interface SubjectFeed {
  readonly subjectId: string;
  readonly title: string;
  readonly chapters: readonly StudyFeedChapter[];
  /**
   * Impronta del contenuto (feed e versioni di allineamento): l'app la usa
   * come ETag per riscaricare la materia solo quando cambia.
   */
  readonly version: ContentHash;
}

/** Feed da riallineare, con la lezione e la versione letta. */
export interface OutdatedFeed {
  readonly feedId: string;
  readonly lessonId: LessonId;
  readonly sourcesHash: ContentHash;
  readonly alignmentVersion: number;
  /** Schede attuali del feed. */
  readonly cards: readonly StoredFeedCard[];
}

/** Esito di {@link ReadSubjectFeed}. */
export interface ReadSubjectFeedResult {
  readonly feed: SubjectFeed;
  /** Feed allineati con regole vecchie: si riallineano dopo la risposta. */
  readonly outdated: readonly OutdatedFeed[];
}

/**
 * Caso d'uso **ListStudySubjects**: le materie da cui lo studente può
 * scegliere il feed.
 */
export class ListStudySubjects {
  /**
   * @param repository - Persistenza del feed di studio.
   */
  constructor(private readonly repository: Pick<StudyFeedRepository, 'listSubjects'>) {}

  /**
   * @param userId - Studente.
   * @returns Le materie con il numero di lezioni pronte.
   */
  execute(userId: UserId): Promise<StudySubject[]> {
    return this.repository.listSubjects(userId);
  }
}

/**
 * Versione di allineamento di un feed salvato (i feed di M2 non la riportano).
 *
 * @param document - Feed salvato.
 * @returns La versione, 1 se manca.
 */
export function alignmentVersionOf(document: LessonFeedDocument): number {
  return document.alignmentVersion ?? 1;
}

/**
 * Caso d'uso **ReadSubjectFeed**: il feed di tutta una materia, in ordine di
 * capitolo e lezione, con gli indirizzi del portale per "Guarda sul portale".
 * Segnala i feed allineati con regole vecchie, che il chiamante riallinea dopo
 * aver risposto (la lettura non aspetta il riallineamento).
 */
export class ReadSubjectFeed {
  /**
   * @param repository - Persistenza del feed di studio.
   * @param sha256 - Implementazione del digest (per l'impronta).
   */
  constructor(
    private readonly repository: Pick<StudyFeedRepository, 'loadSubjectFeeds'>,
    private readonly sha256: Sha256 = webCryptoSha256,
  ) {}

  /**
   * @param userId - Studente.
   * @param subjectId - Materia.
   * @returns Il feed della materia e i feed da riallineare.
   * @throws {@link DomainError} `NOT_FOUND` se lo studente non vede la materia.
   */
  async execute(userId: UserId, subjectId: string): Promise<ReadSubjectFeedResult> {
    const rows = await this.repository.loadSubjectFeeds(userId, subjectId);
    if (rows === null) throw new DomainError('NOT_FOUND', 'Materia non trovata');

    const chapters: StudyFeedChapter[] = [];
    const outdated: OutdatedFeed[] = [];
    const fingerprint: string[] = [];
    for (const row of rows.lessons) {
      let chapter = chapters.at(-1);
      if (chapter?.chapterId !== row.chapterId) {
        chapter = { chapterId: row.chapterId, title: row.chapterTitle, lessons: [] };
        chapters.push(chapter);
      }
      const document = row.feed?.document ?? null;
      if (row.feed && document && alignmentVersionOf(document) < ALIGNMENT_VERSION) {
        outdated.push({
          feedId: row.feed.feedId,
          lessonId: row.lessonId,
          sourcesHash: document.sourcesHash,
          alignmentVersion: alignmentVersionOf(document),
          cards: document.cards,
        });
      }
      fingerprint.push(
        `${row.lessonId}:${row.feed?.feedId ?? '-'}:${document ? alignmentVersionOf(document) : 0}:${row.parts.length}`,
      );
      const lessonUrl = portalContentUrl(rows.epicodeId, row.epicodeId);
      (chapter.lessons as StudyFeedLesson[]).push({
        lessonId: row.lessonId,
        title: row.title,
        position: row.position,
        portalUrl: lessonUrl,
        parts: row.parts.map((part) => ({
          ...part,
          // Le slide vengono dallo zip della lezione (ADR 0012) e non hanno una
          // pagina loro sul portale: il link porta alla lezione.
          portalUrl:
            part.kind === 'slides' ? lessonUrl : portalContentUrl(rows.epicodeId, part.epicodeId),
        })),
        feed: document,
      });
    }

    const version = await hashText(`${rows.subjectId}|${fingerprint.join('|')}`, this.sha256);
    return {
      feed: { subjectId: rows.subjectId, title: rows.title, chapters, version },
      outdated,
    };
  }
}

/**
 * Caso d'uso **RealignLessonFeeds**: ricalcola i minuti dei feed salvati con
 * regole di allineamento vecchie (ADR 0015), senza rigenerare nulla.
 *
 * Usa le fonti come le vede lo studente che legge: se nel frattempo la lezione
 * è cambiata (impronta diversa), il feed si lascia com'è, perché le sue schede
 * potrebbero citare parti che non esistono più.
 */
export class RealignLessonFeeds {
  /**
   * @param sources - Lettura delle fonti con i permessi dello studente.
   * @param repository - Scrittura del feed riallineato.
   * @param sha256 - Implementazione del digest.
   */
  constructor(
    private readonly sources: Pick<GenerationRepository, 'loadLessonSources'>,
    private readonly repository: Pick<StudyFeedRepository, 'updateFeedAlignment'>,
    private readonly sha256: Sha256 = webCryptoSha256,
  ) {}

  /**
   * @param userId - Studente che ha letto i feed.
   * @param feeds - Feed da riallineare, con le schede attuali.
   * @returns Quanti feed sono stati aggiornati e quante schede hanno ora un minuto.
   */
  async execute(
    userId: UserId,
    feeds: readonly OutdatedFeed[],
  ): Promise<{ readonly updated: number; readonly alignedCards: number }> {
    let updated = 0;
    let alignedCards = 0;
    // Una lezione alla volta: poche connessioni e nessun picco sul database.
    for (const feed of feeds) {
      const sources = await this.sources.loadLessonSources(userId, feed.lessonId);
      if (sources === null) continue;
      const hash = await computeLessonSourcesHash(sources.parts, this.sha256);
      if (hash !== feed.sourcesHash) continue;
      const cards = alignFeedCards(feed.cards, sources.parts);
      const done = await this.repository.updateFeedAlignment(
        feed.feedId,
        cards,
        ALIGNMENT_VERSION,
        feed.alignmentVersion,
      );
      if (done) {
        updated += 1;
        alignedCards += cards.filter((card) => card.video !== null).length;
      }
    }
    return { updated, alignedCards };
  }
}

/** SHA-256 esadecimale di un testo. */
async function hashText(text: string, sha256: Sha256): Promise<ContentHash> {
  const digest = await sha256(new TextEncoder().encode(text));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('') as ContentHash;
}
