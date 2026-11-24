import type {
  ExamBankDocument,
  ExamBankDraft,
  ExamPackDocument,
  ExamPackDraft,
} from '../domain/exam.js';
import type { LessonFeedDocument } from '../domain/feed.js';
import type { LessonId, UserId, Clock } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import { FeedValidationError } from '../domain/feed.js';
import { checkExamBank, checkExamPack } from '../domain/exam.js';

/**
 * Casi d'uso della generazione dei pacchetti d'esame (M4, ADR 0014 e ADR
 * 0017). Come per i feed, li chiama l'API per conto del server MCP di Claude
 * Desktop: elencare le lezioni senza pacchetto, leggere il feed di una
 * lezione, salvare il pacchetto.
 *
 * Un pacchetto appartiene al feed **corrente** della lezione (il più recente
 * tra quelli visibili allo studente) e ne usa i concetti.
 */

/** Feed corrente di una lezione, con i titoli per Claude. */
export interface CurrentLessonFeed {
  readonly lessonId: LessonId;
  readonly lessonTitle: string;
  readonly chapterTitle: string;
  readonly subjectTitle: string;
  readonly feedId: string;
  /** `true` se il feed ha già un pacchetto d'esame. */
  readonly hasExamPack: boolean;
}

/** Feed corrente con il documento. */
export interface CurrentLessonFeedWithDocument extends CurrentLessonFeed {
  readonly document: LessonFeedDocument;
}

/** Persistenza dei pacchetti d'esame. Le letture rispettano i permessi dello studente. */
export interface ExamPackRepository {
  /**
   * Feed corrente di ogni lezione dello studente che ne ha uno.
   *
   * @param userId - Studente.
   * @returns I feed, in ordine di materia, capitolo e posizione.
   */
  listCurrentFeeds(userId: UserId): Promise<CurrentLessonFeed[]>;

  /**
   * Feed corrente di una lezione, se lo studente lo vede.
   *
   * @param userId - Studente.
   * @param lessonId - Lezione.
   * @returns Il feed con il documento, oppure `null`.
   */
  loadCurrentFeed(
    userId: UserId,
    lessonId: LessonId,
  ): Promise<CurrentLessonFeedWithDocument | null>;

  /**
   * Salva il pacchetto di un feed. Se il feed ne ha già uno, non cambia nulla.
   *
   * @returns L'id del pacchetto e se è stato creato ora.
   */
  saveExamPack(pack: {
    readonly document: ExamPackDocument;
    readonly generatedBy: UserId;
  }): Promise<{ readonly packId: string; readonly created: boolean }>;
}

/** Lezione senza pacchetto d'esame, come la vede il server MCP. */
export interface LessonForExam {
  readonly lessonId: LessonId;
  readonly lessonTitle: string;
  readonly chapterTitle: string;
  readonly subjectTitle: string;
}

/** Esito di {@link ListLessonsForExam}. */
export interface LessonsForExamResult {
  readonly lessons: readonly LessonForExam[];
  readonly totals: {
    readonly lessons: number;
    readonly ready: number;
    readonly toGenerate: number;
  };
}

/**
 * Caso d'uso **ListLessonsForExam**: le lezioni con un feed il cui feed
 * corrente non ha ancora un pacchetto d'esame.
 */
export class ListLessonsForExam {
  /**
   * @param repository - Persistenza dei pacchetti.
   */
  constructor(private readonly repository: Pick<ExamPackRepository, 'listCurrentFeeds'>) {}

  /**
   * @param userId - Studente.
   * @param limit - Massimo di lezioni restituite (i totali contano tutte).
   * @returns Le lezioni da completare e i totali.
   */
  async execute(userId: UserId, limit: number): Promise<LessonsForExamResult> {
    const feeds = await this.repository.listCurrentFeeds(userId);
    const pending = feeds.filter((feed) => !feed.hasExamPack);
    return {
      lessons: pending.slice(0, Math.max(0, limit)).map((feed) => ({
        lessonId: feed.lessonId,
        lessonTitle: feed.lessonTitle,
        chapterTitle: feed.chapterTitle,
        subjectTitle: feed.subjectTitle,
      })),
      totals: {
        lessons: feeds.length,
        ready: feeds.length - pending.length,
        toGenerate: pending.length,
      },
    };
  }
}

/** Materiale per scrivere il pacchetto d'esame: il feed in inglese. */
export interface LessonExamMaterial extends CurrentLessonFeed {
  readonly concepts: readonly {
    readonly key: string;
    readonly name: string;
    readonly description: string;
  }[];
  readonly cards: readonly {
    readonly title: string;
    readonly keyPoint: string;
    readonly body: string;
    readonly steps?: readonly string[];
    readonly code?: { readonly language: string; readonly source: string };
    readonly conceptKeys: readonly string[];
  }[];
  /** Domande del quiz del feed, da non ripetere. */
  readonly feedQuestions: readonly string[];
}

/**
 * Riduce un feed alla sola parte inglese che serve per scrivere le domande
 * d'esame: meno testo per Claude, e l'esame è in inglese.
 *
 * @param feed - Feed corrente della lezione.
 * @returns Il materiale.
 */
export function examMaterialFromFeed(feed: CurrentLessonFeedWithDocument): LessonExamMaterial {
  const { document, ...summary } = feed;
  return {
    ...summary,
    concepts: document.concepts.map((concept) => ({
      key: concept.key,
      name: concept.name.en,
      description: concept.description.en,
    })),
    cards: document.cards.map((card) => ({
      title: card.title.en,
      keyPoint: card.keyPoint.en,
      body: card.body.en,
      ...(card.steps ? { steps: card.steps.en } : {}),
      ...(card.code ? { code: { language: card.code.language, source: card.code.source } } : {}),
      conceptKeys: card.conceptKeys,
    })),
    feedQuestions: document.quiz.map((item) => item.question.en),
  };
}

/** Caso d'uso **ReadLessonForExam**: il feed corrente di una lezione, per Claude. */
export class ReadLessonForExam {
  /**
   * @param repository - Persistenza dei pacchetti.
   */
  constructor(private readonly repository: Pick<ExamPackRepository, 'loadCurrentFeed'>) {}

  /**
   * @param userId - Studente.
   * @param lessonId - Lezione.
   * @returns Il materiale per il pacchetto.
   * @throws {@link DomainError} `NOT_FOUND` se la lezione non ha un feed visibile.
   */
  async execute(userId: UserId, lessonId: LessonId): Promise<LessonExamMaterial> {
    const feed = await this.repository.loadCurrentFeed(userId, lessonId);
    if (feed === null) {
      throw new DomainError('NOT_FOUND', 'Lezione senza feed: genera prima il feed della lezione');
    }
    return examMaterialFromFeed(feed);
  }
}

/** Richiesta di salvataggio di un pacchetto (forma già validata dai contratti). */
export interface SaveExamPackInput {
  readonly lessonId: LessonId;
  readonly feedId: string;
  readonly promptVersion: string;
  readonly pack: ExamPackDraft;
}

/** Esito di {@link SaveExamPack}. */
export interface SaveExamPackResult {
  readonly packId: string;
  readonly created: boolean;
  readonly questions: number;
  readonly openQuestions: number;
}

/**
 * Caso d'uso **SaveExamPack**: controlla il pacchetto con le regole del core
 * ({@link checkExamPack}) contro il feed corrente della lezione e lo salva.
 * Se nel frattempo la lezione ha un feed nuovo, il pacchetto è rifiutato.
 */
export class SaveExamPack {
  /**
   * @param deps - Persistenza e orologio.
   */
  constructor(
    private readonly deps: {
      readonly repository: Pick<ExamPackRepository, 'loadCurrentFeed' | 'saveExamPack'>;
      readonly clock: Clock;
    },
  ) {}

  /**
   * @param userId - Studente che ha generato il pacchetto.
   * @param input - Pacchetto e feed letto.
   * @returns L'esito del salvataggio.
   * @throws {@link DomainError} `NOT_FOUND`, `SOURCES_CHANGED`, oppure
   *   {@link FeedValidationError} con l'elenco dei problemi.
   */
  async execute(userId: UserId, input: SaveExamPackInput): Promise<SaveExamPackResult> {
    const feed = await this.deps.repository.loadCurrentFeed(userId, input.lessonId);
    if (feed === null) {
      throw new DomainError('NOT_FOUND', 'Lezione senza feed: genera prima il feed della lezione');
    }
    if (feed.feedId !== input.feedId) {
      throw new DomainError(
        'SOURCES_CHANGED',
        'Il feed della lezione è cambiato dopo la lettura: rileggilo e riscrivi il pacchetto',
      );
    }
    const issues = checkExamPack(input.pack, {
      conceptKeys: new Set(feed.document.concepts.map((concept) => concept.key)),
      feedQuestions: feed.document.quiz.map((item) => item.question.en),
    });
    if (issues.length > 0) throw new FeedValidationError(issues, "Il pacchetto d'esame");

    const saved = await this.deps.repository.saveExamPack({
      document: {
        lessonId: input.lessonId,
        feedId: feed.feedId,
        promptVersion: input.promptVersion,
        generatedAt: this.deps.clock.now().toISOString(),
        questions: input.pack.questions,
        openQuestions: input.pack.openQuestions,
      },
      generatedBy: userId,
    });
    return {
      ...saved,
      questions: input.pack.questions.length,
      openQuestions: input.pack.openQuestions.length,
    };
  }
}

// ---------------------------------------------------------------------------
// Banca degli esercizi della materia
// ---------------------------------------------------------------------------

/** Materia con i concetti dei suoi feed, per scrivere la banca d'esame. */
export interface SubjectForExam {
  readonly subjectId: string;
  readonly subjectTitle: string;
  /** Concetti dei feed correnti della materia, senza doppioni (testi in inglese). */
  readonly concepts: readonly {
    readonly key: string;
    readonly name: string;
    readonly description: string;
  }[];
  /** `true` se lo studente ha già salvato una banca per la materia. */
  readonly hasBank: boolean;
}

/**
 * Persistenza delle banche d'esame. Una banca è **privata** di chi la genera:
 * nasce dal materiale d'esame letto sul suo PC, che EpicFeed non riceve e
 * quindi non può legare a una prova di possesso condivisibile.
 */
export interface ExamBankRepository {
  /**
   * Materie con almeno un feed visibile allo studente, con i loro concetti.
   *
   * @param userId - Studente.
   * @returns Le materie, in ordine di titolo.
   */
  listSubjectsForExam(userId: UserId): Promise<SubjectForExam[]>;

  /**
   * Salva la banca dello studente per la materia. Se ne ha già una, non cambia nulla.
   *
   * @returns L'id della banca e se è stata creata ora.
   */
  saveExamBank(bank: {
    readonly document: ExamBankDocument;
    readonly generatedBy: UserId;
  }): Promise<{ readonly bankId: string; readonly created: boolean }>;
}

/** Caso d'uso **ListSubjectsForExam**: materie e concetti per la banca d'esame. */
export class ListSubjectsForExam {
  /**
   * @param repository - Persistenza delle banche.
   */
  constructor(private readonly repository: Pick<ExamBankRepository, 'listSubjectsForExam'>) {}

  /**
   * @param userId - Studente.
   * @returns Le materie con almeno un feed.
   */
  execute(userId: UserId): Promise<SubjectForExam[]> {
    return this.repository.listSubjectsForExam(userId);
  }
}

/** Richiesta di salvataggio di una banca (forma già validata dai contratti). */
export interface SaveExamBankInput {
  readonly subjectId: string;
  readonly promptVersion: string;
  readonly bank: ExamBankDraft;
}

/** Esito di {@link SaveExamBank}. */
export interface SaveExamBankResult {
  readonly bankId: string;
  readonly created: boolean;
  readonly officials: number;
  readonly variants: number;
}

/**
 * Caso d'uso **SaveExamBank**: controlla la banca degli esercizi con le regole
 * del core ({@link checkExamBank}) sui concetti dei feed della materia e la
 * salva, privata dello studente.
 */
export class SaveExamBank {
  /**
   * @param deps - Persistenza e orologio.
   */
  constructor(
    private readonly deps: {
      readonly repository: ExamBankRepository;
      readonly clock: Clock;
    },
  ) {}

  /**
   * @param userId - Studente che ha generato la banca.
   * @param input - Materia e banca.
   * @returns L'esito del salvataggio.
   * @throws {@link DomainError} `NOT_FOUND`, oppure {@link FeedValidationError}.
   */
  async execute(userId: UserId, input: SaveExamBankInput): Promise<SaveExamBankResult> {
    const subjects = await this.deps.repository.listSubjectsForExam(userId);
    const subject = subjects.find((item) => item.subjectId === input.subjectId);
    if (!subject) {
      throw new DomainError('NOT_FOUND', 'Materia senza feed tra quelle che hai importato');
    }
    const issues = checkExamBank(
      input.bank,
      new Set(subject.concepts.map((concept) => concept.key)),
    );
    if (issues.length > 0) throw new FeedValidationError(issues, "La banca d'esame");

    const saved = await this.deps.repository.saveExamBank({
      document: {
        subjectId: subject.subjectId,
        promptVersion: input.promptVersion,
        generatedAt: this.deps.clock.now().toISOString(),
        exercises: input.bank.exercises,
      },
      generatedBy: userId,
    });
    const officials = input.bank.exercises.filter((item) => item.origin === 'official').length;
    return { ...saved, officials, variants: input.bank.exercises.length - officials };
  }
}
