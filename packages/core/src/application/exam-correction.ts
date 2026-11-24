import type {
  ExamCorrectionDraft,
  ExamSubmissionDraft,
  SubmissionKind,
} from '../domain/exam-correction.js';
import type { UserId, Clock } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import { checkCorrection, EXAM_CORRECTION_LIMITS } from '../domain/exam-correction.js';
import { FeedValidationError } from '../domain/feed.js';

/**
 * Casi d'uso della correzione di Claude (M4, ADR 0014 §4): l'app invia le
 * risposte, Claude Desktop le legge e salva la correzione con gli strumenti
 * MCP, l'app la scarica e cancella l'invio dal server.
 */

/** Invio salvato, con la correzione se è arrivata. */
export interface StoredSubmission {
  readonly id: string;
  readonly subjectId: string;
  readonly kind: SubmissionKind;
  readonly submission: ExamSubmissionDraft;
  readonly correction: ExamCorrectionDraft | null;
  readonly createdAt: string;
  readonly correctedAt: string | null;
}

/**
 * Persistenza degli invii. Ogni operazione riguarda solo gli invii dello
 * studente indicato e ignora quelli scaduti.
 */
export interface ExamSubmissionRepository {
  /** `true` se lo studente vede la materia (l'ha importata). */
  subjectVisible(userId: UserId, subjectId: string): Promise<boolean>;
  /** Invii non ancora corretti. */
  countPending(userId: UserId): Promise<number>;
  /** Salva un invio e ne restituisce l'id. */
  create(userId: UserId, draft: ExamSubmissionDraft): Promise<string>;
  /** Invii dello studente, dal più vecchio. */
  list(userId: UserId, filter: 'all' | 'pending'): Promise<StoredSubmission[]>;
  /** Un invio, oppure `null`. */
  load(userId: UserId, id: string): Promise<StoredSubmission | null>;
  /**
   * Salva la correzione solo se l'invio non ne ha già una.
   *
   * @returns `true` se salvata.
   */
  saveCorrection(
    userId: UserId,
    id: string,
    correction: ExamCorrectionDraft,
    at: Date,
  ): Promise<boolean>;
  /** Cancella un invio; `true` se c'era. */
  delete(userId: UserId, id: string): Promise<boolean>;
  /** Cancella gli invii scaduti di tutti (al massimo 30 giorni). */
  purgeExpired(now: Date): Promise<number>;
}

/**
 * Caso d'uso **SubmitForCorrection**: mette in coda le risposte per Claude.
 * Al massimo {@link EXAM_CORRECTION_LIMITS.pending} invii in attesa.
 */
export class SubmitForCorrection {
  /** @param repository - Persistenza degli invii. */
  constructor(private readonly repository: ExamSubmissionRepository) {}

  /**
   * @param userId - Studente.
   * @param draft - Domande e risposte.
   * @returns L'id dell'invio.
   * @throws {@link DomainError} `NOT_FOUND` (materia non visibile) o `LIMIT_REACHED`.
   */
  async execute(userId: UserId, draft: ExamSubmissionDraft): Promise<{ id: string }> {
    if (!(await this.repository.subjectVisible(userId, draft.subjectId))) {
      throw new DomainError('NOT_FOUND', 'Materia non trovata tra quelle che hai importato');
    }
    if ((await this.repository.countPending(userId)) >= EXAM_CORRECTION_LIMITS.pending) {
      throw new DomainError(
        'LIMIT_REACHED',
        `Hai già ${EXAM_CORRECTION_LIMITS.pending} risposte in attesa: falle correggere a Claude prima di inviarne altre`,
      );
    }
    return { id: await this.repository.create(userId, draft) };
  }
}

/**
 * Caso d'uso **ListSubmissions**: invii dello studente (tutti per l'app, solo
 * quelli da correggere per Claude Desktop). Prima toglie quelli scaduti.
 */
export class ListSubmissions {
  /**
   * @param repository - Persistenza degli invii.
   * @param clock - Orologio.
   */
  constructor(
    private readonly repository: ExamSubmissionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * @param userId - Studente.
   * @param filter - Tutti o solo quelli senza correzione.
   * @returns Gli invii.
   */
  async execute(userId: UserId, filter: 'all' | 'pending'): Promise<StoredSubmission[]> {
    await this.repository.purgeExpired(this.clock.now());
    return this.repository.list(userId, filter);
  }
}

/** Caso d'uso **SaveCorrection**: salva la correzione di Claude dopo i controlli. */
export class SaveCorrection {
  /**
   * @param repository - Persistenza degli invii.
   * @param clock - Orologio.
   */
  constructor(
    private readonly repository: ExamSubmissionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * @param userId - Studente (proprietario del token di Claude Desktop).
   * @param id - Invio.
   * @param correction - Correzione.
   * @throws {@link DomainError} `NOT_FOUND`, `ALREADY_DONE`, oppure {@link FeedValidationError}.
   */
  async execute(userId: UserId, id: string, correction: ExamCorrectionDraft): Promise<void> {
    const stored = await this.repository.load(userId, id);
    if (!stored) throw new DomainError('NOT_FOUND', 'Risposta da correggere non trovata');
    if (stored.correction) throw new DomainError('ALREADY_DONE', 'Questa risposta è già corretta');
    const issues = checkCorrection(correction, stored.submission);
    if (issues.length > 0) throw new FeedValidationError(issues, 'La correzione');
    const saved = await this.repository.saveCorrection(userId, id, correction, this.clock.now());
    if (!saved) throw new DomainError('ALREADY_DONE', 'Questa risposta è già corretta');
  }
}

/** Caso d'uso **DeleteSubmission**: l'app ha conservato la correzione, il server la dimentica. */
export class DeleteSubmission {
  /** @param repository - Persistenza degli invii. */
  constructor(private readonly repository: ExamSubmissionRepository) {}

  /**
   * @param userId - Studente.
   * @param id - Invio.
   * @throws {@link DomainError} `NOT_FOUND`.
   */
  async execute(userId: UserId, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) {
      throw new DomainError('NOT_FOUND', 'Risposta non trovata');
    }
  }
}
