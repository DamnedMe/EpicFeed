import type {
  ContentHash,
  ContentVersionId,
  GenerationStatus,
  GlossaryEntry,
  LessonFeedDocument,
  LessonFeedDraft,
  LessonId,
  LessonPartContent,
  LessonPartId,
  LessonPartKind,
  LessonSource,
  Sha256,
  StoredFeedCard,
  SubtitleTrack,
  UserId,
} from '../domain/index.js';
import {
  DomainError,
  FeedValidationError,
  alignCard,
  canTransition,
  checkLessonFeed,
  computeLessonSourcesHash,
  webCryptoSha256,
} from '../domain/index.js';
import type { Clock } from './ports.js';

/**
 * Casi d'uso della generazione (M2, ADR 0007 e ADR 0013). Li chiama l'API
 * per conto del server MCP di Claude Desktop: elencare le lezioni da generare,
 * leggere le fonti di una lezione, salvarne il feed.
 */

/** Parte di una lezione come fonte della generazione: la versione più recente dello studente. */
export interface LessonSourcePart {
  readonly lessonPartId: LessonPartId;
  readonly contentVersionId: ContentVersionId;
  readonly contentHash: ContentHash;
  readonly title: string;
  readonly kind: LessonPartKind;
  readonly position: number;
  readonly content: LessonPartContent;
  readonly generationStatus: GenerationStatus;
  /** Tracce di sottotitoli accessibili allo studente (servono all'allineamento). */
  readonly subtitles: readonly SubtitleTrack[];
}

/** Fonti di una lezione, come le vede uno studente. */
export interface LessonSources {
  readonly lessonId: LessonId;
  readonly lessonTitle: string;
  readonly chapterTitle: string;
  readonly subjectId: string;
  readonly subjectTitle: string;
  /** Parti ordinate per posizione. */
  readonly parts: readonly LessonSourcePart[];
  /** Glossario della materia accumulato finora. */
  readonly glossary: readonly GlossaryEntry[];
}

/** Lezione posseduta dallo studente, con le versioni correnti delle sue parti. */
export interface OwnedLesson {
  readonly lessonId: LessonId;
  readonly lessonTitle: string;
  readonly chapterTitle: string;
  readonly subjectTitle: string;
  readonly sources: readonly LessonSource[];
}

/** Feed da salvare, già controllato e allineato. */
export interface NewLessonFeed {
  readonly document: LessonFeedDocument;
  readonly subjectId: string;
  readonly sourceVersionIds: readonly ContentVersionId[];
  readonly glossary: readonly GlossaryEntry[];
  readonly generatedBy: UserId;
  /** Stati da cui le versioni delle fonti passano a `ready`. */
  readonly readyFrom: readonly GenerationStatus[];
}

/** Persistenza della generazione. Le letture rispettano i permessi dello studente. */
export interface GenerationRepository {
  /**
   * Elenca le lezioni possedute dallo studente con le versioni correnti.
   *
   * @param userId - Studente.
   * @returns Le lezioni, in ordine di materia, capitolo e posizione.
   */
  listOwnedLessons(userId: UserId): Promise<OwnedLesson[]>;

  /**
   * Elenca i feed visibili allo studente (quelli di cui possiede tutte le fonti).
   *
   * @param userId - Studente.
   * @returns Lezione e impronta delle fonti di ogni feed.
   */
  listVisibleFeeds(
    userId: UserId,
  ): Promise<{ readonly lessonId: LessonId; readonly sourcesHash: ContentHash }[]>;

  /**
   * Carica le fonti di una lezione posseduta dallo studente.
   *
   * @param userId - Studente.
   * @param lessonId - Lezione.
   * @returns Le fonti, oppure `null` se lo studente non possiede la lezione.
   */
  loadLessonSources(userId: UserId, lessonId: LessonId): Promise<LessonSources | null>;

  /**
   * Cambia lo stato di generazione delle versioni che sono in uno degli stati di partenza.
   *
   * @param versionIds - Versioni da aggiornare.
   * @param to - Nuovo stato.
   * @param from - Stati da cui la transizione è ammessa.
   */
  setGenerationStatus(
    versionIds: readonly ContentVersionId[],
    to: GenerationStatus,
    from: readonly GenerationStatus[],
  ): Promise<void>;

  /**
   * Salva il feed, il glossario e lo stato delle versioni in una transazione.
   * Se esiste già un feed per la stessa lezione e impronta, non cambia nulla.
   *
   * @param feed - Feed da salvare.
   * @returns L'id del feed e se è stato creato ora.
   */
  saveLessonFeed(
    feed: NewLessonFeed,
  ): Promise<{ readonly feedId: string; readonly created: boolean }>;
}

/** Stati da cui una versione può passare a `to` (dalle regole del dominio). */
function statesLeadingTo(to: GenerationStatus): GenerationStatus[] {
  const all: GenerationStatus[] = ['pending', 'generating', 'ready', 'failed'];
  return all.filter((from) => canTransition(from, to));
}

/** Lezione da generare, come la vede il server MCP. */
export interface LessonToGenerate {
  readonly lessonId: LessonId;
  readonly lessonTitle: string;
  readonly chapterTitle: string;
  readonly subjectTitle: string;
  readonly partCount: number;
}

/** Esito di {@link ListLessonsToGenerate}. */
export interface LessonsToGenerateResult {
  readonly lessons: readonly LessonToGenerate[];
  readonly totals: {
    readonly lessons: number;
    readonly ready: number;
    readonly toGenerate: number;
  };
}

/**
 * Caso d'uso **ListLessonsToGenerate**: le lezioni dello studente che non
 * hanno ancora un feed per le loro fonti attuali. L'impronta delle fonti si
 * calcola qui, con la stessa funzione usata al salvataggio, così "da generare"
 * e "generata" non possono divergere.
 */
export class ListLessonsToGenerate {
  /**
   * @param repository - Persistenza della generazione.
   * @param sha256 - Implementazione del digest.
   */
  constructor(
    private readonly repository: GenerationRepository,
    private readonly sha256: Sha256 = webCryptoSha256,
  ) {}

  /**
   * @param userId - Studente.
   * @param limit - Massimo di lezioni restituite (i totali contano tutte).
   * @returns Le lezioni da generare e i totali.
   */
  async execute(userId: UserId, limit: number): Promise<LessonsToGenerateResult> {
    const [owned, feeds] = await Promise.all([
      this.repository.listOwnedLessons(userId),
      this.repository.listVisibleFeeds(userId),
    ]);
    const generated = new Set(feeds.map((feed) => `${feed.lessonId}:${feed.sourcesHash}`));
    const pending: LessonToGenerate[] = [];
    for (const lesson of owned) {
      const hash = await computeLessonSourcesHash(lesson.sources, this.sha256);
      if (!generated.has(`${lesson.lessonId}:${hash}`)) {
        pending.push({
          lessonId: lesson.lessonId,
          lessonTitle: lesson.lessonTitle,
          chapterTitle: lesson.chapterTitle,
          subjectTitle: lesson.subjectTitle,
          partCount: lesson.sources.length,
        });
      }
    }
    return {
      lessons: pending.slice(0, Math.max(0, limit)),
      totals: {
        lessons: owned.length,
        ready: owned.length - pending.length,
        toGenerate: pending.length,
      },
    };
  }
}

/** Fonti di una lezione con la loro impronta, pronte per Claude. */
export interface LessonForGeneration extends LessonSources {
  readonly sourcesHash: ContentHash;
}

/**
 * Caso d'uso **ReadLessonForGeneration**: le fonti di una lezione posseduta,
 * con la loro impronta (da restituire al salvataggio). Segna le versioni come
 * `generating`, così l'app mostra che la generazione è partita.
 */
export class ReadLessonForGeneration {
  /**
   * @param repository - Persistenza della generazione.
   * @param sha256 - Implementazione del digest.
   */
  constructor(
    private readonly repository: GenerationRepository,
    private readonly sha256: Sha256 = webCryptoSha256,
  ) {}

  /**
   * @param userId - Studente.
   * @param lessonId - Lezione.
   * @returns Le fonti e l'impronta.
   * @throws {@link DomainError} `NOT_FOUND` se lo studente non possiede la lezione.
   */
  async execute(userId: UserId, lessonId: LessonId): Promise<LessonForGeneration> {
    const sources = await this.repository.loadLessonSources(userId, lessonId);
    if (sources === null || sources.parts.length === 0) {
      throw new DomainError('NOT_FOUND', 'Lezione non trovata tra quelle importate');
    }
    const sourcesHash = await computeLessonSourcesHash(sources.parts, this.sha256);
    await this.repository.setGenerationStatus(
      sources.parts.map((part) => part.contentVersionId),
      'generating',
      statesLeadingTo('generating'),
    );
    return { ...sources, sourcesHash };
  }
}

/** Richiesta di salvataggio di un feed (forma già validata dai contratti). */
export interface SaveLessonFeedInput {
  readonly lessonId: LessonId;
  readonly sourcesHash: string;
  readonly promptVersion: string;
  readonly feed: LessonFeedDraft;
}

/** Esito di {@link SaveLessonFeed}. */
export interface SaveLessonFeedResult {
  readonly feedId: string;
  /** `false` se un feed per le stesse fonti esisteva già (vale il primo). */
  readonly created: boolean;
  readonly cards: number;
  /** Schede a cui è stato trovato il minuto del video. */
  readonly alignedCards: number;
}

/** Dipendenze di {@link SaveLessonFeed}. */
export interface SaveLessonFeedDeps {
  readonly repository: GenerationRepository;
  readonly clock: Clock;
  readonly sha256?: Sha256;
}

/**
 * Caso d'uso **SaveLessonFeed**: controlla un feed generato da Claude, lo
 * allinea ai video e lo salva.
 *
 * 1. ricarica le fonti con i permessi dello studente e ne ricalcola l'impronta:
 *    se non coincide con quella letta da Claude, la lezione è cambiata nel
 *    frattempo e il feed viene rifiutato;
 * 2. applica {@link checkLessonFeed}: se ci sono problemi, li restituisce tutti;
 * 3. calcola il tratto di video di ogni scheda tratta da una parte video;
 * 4. salva feed, glossario e stato `ready` delle versioni in una transazione.
 */
export class SaveLessonFeed {
  private readonly sha256: Sha256;

  /**
   * @param deps - Persistenza, orologio e digest.
   */
  constructor(private readonly deps: SaveLessonFeedDeps) {
    this.sha256 = deps.sha256 ?? webCryptoSha256;
  }

  /**
   * @param userId - Studente che ha generato il feed.
   * @param input - Feed e riferimenti alle fonti.
   * @returns L'esito del salvataggio.
   * @throws {@link DomainError} `NOT_FOUND`, `SOURCES_CHANGED`, oppure
   *   {@link FeedValidationError} con l'elenco dei problemi.
   */
  async execute(userId: UserId, input: SaveLessonFeedInput): Promise<SaveLessonFeedResult> {
    const sources = await this.deps.repository.loadLessonSources(userId, input.lessonId);
    if (sources === null || sources.parts.length === 0) {
      throw new DomainError('NOT_FOUND', 'Lezione non trovata tra quelle importate');
    }
    const sourcesHash = await computeLessonSourcesHash(sources.parts, this.sha256);
    if (sourcesHash !== input.sourcesHash) {
      throw new DomainError(
        'SOURCES_CHANGED',
        'La lezione è cambiata dopo la lettura: rileggila e rigenera il feed',
      );
    }

    const partsById = new Map(sources.parts.map((part) => [part.lessonPartId as string, part]));
    const issues = checkLessonFeed(input.feed, { partIds: new Set(partsById.keys()) });
    if (issues.length > 0) throw new FeedValidationError(issues);

    const cards: StoredFeedCard[] = input.feed.cards.map((card) => {
      const part = partsById.get(card.sourcePartId);
      const video =
        part?.kind === 'video' && part.subtitles.length > 0
          ? alignCard(card, part.subtitles)
          : null;
      return { ...card, video };
    });

    const document: LessonFeedDocument = {
      lessonId: input.lessonId,
      sourcesHash,
      promptVersion: input.promptVersion,
      generatedAt: this.deps.clock.now().toISOString(),
      cards,
      quiz: input.feed.quiz,
      concepts: input.feed.concepts,
    };
    const saved = await this.deps.repository.saveLessonFeed({
      document,
      subjectId: sources.subjectId,
      sourceVersionIds: sources.parts.map((part) => part.contentVersionId),
      glossary: input.feed.glossary,
      generatedBy: userId,
      readyFrom: statesLeadingTo('ready'),
    });
    return {
      feedId: saved.feedId,
      created: saved.created,
      cards: cards.length,
      alignedCards: cards.filter((card) => card.video !== null).length,
    };
  }
}
