import type { Clock, UserId } from '@epicfeed/shared';
import { DomainError } from '@epicfeed/shared';
import type {
  ClaudeStatus,
  CorrectionCompletion,
  CorrectionDraft,
  StoredCorrection,
} from '../domain/corrections.js';
import {
  CORRECTION_LIMITS,
  checkCompletion,
  checkCorrectionDraft,
  initialClaudeStatus,
} from '../domain/corrections.js';
import { FeedValidationError } from '../domain/feed.js';

/**
 * Casi d'uso di Segnala errore (M5, ADR 0020): lo studente segnala e annulla
 * dalla web app, Claude Desktop completa le correzioni in attesa (altra lingua,
 * schede da rifare) con gli strumenti MCP.
 *
 * Le correzioni sono personali: ogni operazione riguarda solo quelle dello
 * studente indicato e non cambia il feed condiviso.
 */

/** Correzione nuova, con l'id scelto dall'app. */
export interface NewCorrection {
  readonly id: string;
  readonly subjectId: string;
  readonly correction: CorrectionDraft;
  readonly claudeStatus: ClaudeStatus;
}

/** Persistenza delle correzioni. */
export interface CorrectionRepository {
  /** `true` se lo studente vede la materia (l'ha importata). */
  subjectVisible(userId: UserId, subjectId: string): Promise<boolean>;
  /** `true` se lo studente vede la lezione e la lezione è della materia. */
  lessonInSubject(userId: UserId, lessonId: string, subjectId: string): Promise<boolean>;
  /** Correzioni salvate dallo studente. */
  count(userId: UserId): Promise<number>;
  /**
   * Salva una correzione. Se l'id esiste già per lo studente non cambia nulla
   * (reinvio dopo un errore di rete).
   *
   * @returns `true` se creata, `false` se c'era già.
   */
  insert(userId: UserId, correction: NewCorrection): Promise<boolean>;
  /** Una correzione, oppure `null`. */
  load(userId: UserId, id: string): Promise<StoredCorrection | null>;
  /** Correzioni dello studente, dalla più vecchia; `pending` = quelle per Claude. */
  list(userId: UserId, filter: 'all' | 'pending'): Promise<StoredCorrection[]>;
  /**
   * Salva l'esito di Claude solo se la correzione è ancora in attesa.
   *
   * @returns `true` se salvato.
   */
  complete(
    userId: UserId,
    id: string,
    completion: CorrectionCompletion,
    at: Date,
  ): Promise<boolean>;
  /** Cancella una correzione; `true` se c'era. */
  delete(userId: UserId, id: string): Promise<boolean>;
}

/** Richiesta di segnalazione. */
export interface ReportErrorInput {
  readonly id: string;
  readonly subjectId: string;
  readonly correction: CorrectionDraft;
}

/**
 * Caso d'uso **ReportError**: salva la correzione di uno studente. Una
 * correzione di lezione vale solo per lezioni che lo studente vede, un
 * termine per una materia che vede. Reinviare lo stesso id non crea doppioni.
 */
export class ReportError {
  /** @param repository - Persistenza delle correzioni. */
  constructor(private readonly repository: CorrectionRepository) {}

  /**
   * @param userId - Studente.
   * @param input - Correzione con id e materia.
   * @returns La correzione salvata e se è nuova.
   * @throws {@link DomainError} `NOT_FOUND`, `LIMIT_REACHED`, oppure {@link FeedValidationError}.
   */
  async execute(
    userId: UserId,
    input: ReportErrorInput,
  ): Promise<{ correction: StoredCorrection; created: boolean }> {
    const issues = checkCorrectionDraft(input.correction);
    if (issues.length > 0) throw new FeedValidationError(issues, 'La correzione');

    const existing = await this.repository.load(userId, input.id);
    if (existing) return { correction: existing, created: false };

    const visible =
      input.correction.kind === 'term'
        ? await this.repository.subjectVisible(userId, input.subjectId)
        : await this.repository.lessonInSubject(userId, input.correction.lessonId, input.subjectId);
    if (!visible) throw new DomainError('NOT_FOUND', 'Lezione non trovata tra quelle importate');

    if ((await this.repository.count(userId)) >= CORRECTION_LIMITS.perUser) {
      throw new DomainError(
        'LIMIT_REACHED',
        `Hai già ${CORRECTION_LIMITS.perUser} correzioni: annullane qualcuna in Io › Le mie segnalazioni`,
      );
    }
    const created = await this.repository.insert(userId, {
      ...input,
      claudeStatus: initialClaudeStatus(input.correction),
    });
    const saved = await this.repository.load(userId, input.id);
    // Id già usato da un altro studente (invisibile per la RLS): l'app ne sceglie un altro.
    if (!saved) throw new DomainError('ALREADY_DONE', 'Id della correzione già in uso');
    return { correction: saved, created };
  }
}

/**
 * Caso d'uso **ListCorrections**: tutte le correzioni per la web app, solo
 * quelle in attesa per Claude Desktop.
 */
export class ListCorrections {
  /** @param repository - Persistenza delle correzioni. */
  constructor(private readonly repository: CorrectionRepository) {}

  /**
   * @param userId - Studente.
   * @param filter - Tutte o solo quelle da completare.
   * @returns Le correzioni, dalla più vecchia.
   */
  execute(userId: UserId, filter: 'all' | 'pending'): Promise<StoredCorrection[]> {
    return this.repository.list(userId, filter);
  }
}

/** Caso d'uso **WithdrawCorrection**: *Annulla* in Le mie segnalazioni. */
export class WithdrawCorrection {
  /** @param repository - Persistenza delle correzioni. */
  constructor(private readonly repository: CorrectionRepository) {}

  /**
   * @param userId - Studente.
   * @param id - Correzione.
   * @throws {@link DomainError} `NOT_FOUND`.
   */
  async execute(userId: UserId, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) {
      throw new DomainError('NOT_FOUND', 'Correzione non trovata');
    }
  }
}

/**
 * Caso d'uso **CompleteCorrection**: salva il lavoro di Claude su una
 * correzione in attesa (la stessa frase nell'altra lingua, la scheda rifatta
 * dai riassunti, oppure una nota se la correzione non trova riscontro).
 */
export class CompleteCorrection {
  /**
   * @param repository - Persistenza delle correzioni.
   * @param clock - Orologio.
   */
  constructor(
    private readonly repository: CorrectionRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * @param userId - Studente (proprietario del token di Claude Desktop).
   * @param id - Correzione.
   * @param completion - Esito.
   * @throws {@link DomainError} `NOT_FOUND`, `ALREADY_DONE`, oppure {@link FeedValidationError}.
   */
  async execute(userId: UserId, id: string, completion: CorrectionCompletion): Promise<void> {
    const stored = await this.repository.load(userId, id);
    if (!stored) throw new DomainError('NOT_FOUND', 'Correzione non trovata');
    if (stored.claudeStatus !== 'pending') {
      throw new DomainError('ALREADY_DONE', 'Questa correzione non è in attesa di Claude');
    }
    const issues = checkCompletion(stored.correction, completion);
    if (issues.length > 0) throw new FeedValidationError(issues, 'La correzione');
    if (!(await this.repository.complete(userId, id, completion, this.clock.now()))) {
      throw new DomainError('ALREADY_DONE', 'Questa correzione non è in attesa di Claude');
    }
  }
}
