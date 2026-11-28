import type { Clock, UserId } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import type { QuestionDraft, StoredQuestion } from '../domain/questions.js';
import { QUESTION_LIMITS, checkAnswer, checkQuestion } from '../domain/questions.js';

/**
 * Casi d'uso delle domande in coda (M6, ADR 0021, scelta 1): lo studente
 * chiede e cancella dalla web app, Claude Desktop legge le domande in attesa
 * e risponde con gli strumenti MCP. Ogni operazione riguarda solo le domande
 * dello studente indicato.
 */

/** Domanda nuova, con l'id scelto dall'app. */
export interface NewQuestion extends QuestionDraft {
  readonly id: string;
  readonly subjectId: string;
}

/** Persistenza delle domande. */
export interface QuestionRepository {
  /** `true` se lo studente vede la lezione e la lezione è della materia. */
  lessonInSubject(userId: UserId, lessonId: string, subjectId: string): Promise<boolean>;
  /** Domande dello studente: tutte e quelle in attesa. */
  count(userId: UserId): Promise<{ total: number; pending: number }>;
  /**
   * Salva una domanda; se l'id c'è già non cambia nulla (reinvio dopo un
   * errore di rete).
   *
   * @returns `true` se creata.
   */
  insert(userId: UserId, question: NewQuestion): Promise<boolean>;
  /** Una domanda, oppure `null`. */
  load(userId: UserId, id: string): Promise<StoredQuestion | null>;
  /**
   * Domande dello studente: tutte (dalla più recente) o quelle in attesa
   * (dalla più vecchia, al massimo `limit`).
   */
  list(userId: UserId, filter: 'all' | 'pending', limit?: number): Promise<StoredQuestion[]>;
  /**
   * Salva la risposta solo se la domanda è ancora in attesa.
   *
   * @returns `true` se salvata.
   */
  answer(userId: UserId, id: string, answer: string, at: Date): Promise<boolean>;
  /** Cancella una domanda; `true` se c'era. */
  delete(userId: UserId, id: string): Promise<boolean>;
}

/** Errore di validazione di una domanda o di una risposta, con l'elenco dei problemi. */
export class QuestionValidationError extends DomainError {
  /**
   * @param issues - Problemi trovati.
   * @param subject - Cosa non va bene («La domanda», «La risposta»).
   */
  constructor(
    readonly issues: readonly string[],
    subject: string,
  ) {
    super('INVALID_CONTENT', `${subject} non va bene: ${issues.join(' ')}`);
    this.name = 'QuestionValidationError';
  }
}

/** Caso d'uso **AskQuestion**: mette in coda una domanda su una scheda. */
export class AskQuestion {
  /** @param repository - Persistenza delle domande. */
  constructor(private readonly repository: QuestionRepository) {}

  /**
   * @param userId - Studente.
   * @param input - Domanda con id, materia, lezione e scheda.
   * @returns La domanda salvata e se è nuova.
   * @throws {@link DomainError} `NOT_FOUND`, `LIMIT_REACHED`, `ALREADY_DONE`, oppure {@link QuestionValidationError}.
   */
  async execute(
    userId: UserId,
    input: NewQuestion,
  ): Promise<{ question: StoredQuestion; created: boolean }> {
    const issues = checkQuestion(input);
    if (issues.length > 0) throw new QuestionValidationError(issues, 'La domanda');

    const existing = await this.repository.load(userId, input.id);
    if (existing) return { question: existing, created: false };

    if (!(await this.repository.lessonInSubject(userId, input.lessonId, input.subjectId))) {
      throw new DomainError('NOT_FOUND', 'Lezione non trovata tra quelle importate');
    }
    const counts = await this.repository.count(userId);
    if (counts.pending >= QUESTION_LIMITS.pending) {
      throw new DomainError(
        'LIMIT_REACHED',
        `Hai già ${String(QUESTION_LIMITS.pending)} domande in attesa: chiedi a Claude Desktop di rispondere`,
      );
    }
    if (counts.total >= QUESTION_LIMITS.total) {
      throw new DomainError(
        'LIMIT_REACHED',
        `Hai già ${String(QUESTION_LIMITS.total)} domande: cancellane qualcuna in Io › Le mie domande`,
      );
    }
    const created = await this.repository.insert(userId, {
      ...input,
      question: input.question.trim(),
    });
    const saved = await this.repository.load(userId, input.id);
    // Id già usato da un altro studente (invisibile per la RLS): l'app ne sceglie un altro.
    if (!saved) throw new DomainError('ALREADY_DONE', 'Id della domanda già in uso');
    return { question: saved, created };
  }
}

/** Caso d'uso **ListQuestions**: tutte per l'app, quelle in attesa per Claude Desktop. */
export class ListQuestions {
  /** @param repository - Persistenza delle domande. */
  constructor(private readonly repository: QuestionRepository) {}

  /**
   * @param userId - Studente.
   * @param filter - Tutte o solo quelle in attesa (al massimo {@link QUESTION_LIMITS.batch}).
   * @returns Le domande.
   */
  execute(userId: UserId, filter: 'all' | 'pending'): Promise<StoredQuestion[]> {
    return filter === 'pending'
      ? this.repository.list(userId, 'pending', QUESTION_LIMITS.batch)
      : this.repository.list(userId, 'all');
  }
}

/** Caso d'uso **DeleteQuestion**: *Cancella* in Le mie domande. */
export class DeleteQuestion {
  /** @param repository - Persistenza delle domande. */
  constructor(private readonly repository: QuestionRepository) {}

  /**
   * @param userId - Studente.
   * @param id - Domanda.
   * @throws {@link DomainError} `NOT_FOUND`.
   */
  async execute(userId: UserId, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) {
      throw new DomainError('NOT_FOUND', 'Domanda non trovata');
    }
  }
}

/** Caso d'uso **AnswerQuestion**: salva la risposta di Claude Desktop. */
export class AnswerQuestion {
  /**
   * @param repository - Persistenza delle domande.
   * @param clock - Orologio.
   */
  constructor(
    private readonly repository: QuestionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * @param userId - Studente (proprietario del token di Claude Desktop).
   * @param id - Domanda.
   * @param answer - Risposta.
   * @throws {@link DomainError} `NOT_FOUND`, `ALREADY_DONE`, oppure {@link QuestionValidationError}.
   */
  async execute(userId: UserId, id: string, answer: string): Promise<void> {
    const issues = checkAnswer(answer);
    if (issues.length > 0) throw new QuestionValidationError(issues, 'La risposta');
    const stored = await this.repository.load(userId, id);
    if (!stored) throw new DomainError('NOT_FOUND', 'Domanda non trovata');
    if (
      stored.status !== 'pending' ||
      !(await this.repository.answer(userId, id, answer.trim(), this.clock.now()))
    ) {
      throw new DomainError('ALREADY_DONE', 'Questa domanda ha già una risposta');
    }
  }
}
