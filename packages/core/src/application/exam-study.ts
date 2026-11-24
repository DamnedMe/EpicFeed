import type {
  ContentHash,
  ExamBankDocument,
  ExamPackDocument,
  LessonId,
  Sha256,
  UserId,
} from '../domain/index.js';
import { DomainError, hashCanonical, webCryptoSha256 } from '../domain/index.js';

/**
 * Lettura dei contenuti d'esame per la sezione Esame della web app (M4,
 * ADR 0017): i pacchetti delle lezioni di una materia e la banca degli
 * esercizi dello studente.
 */

/** Pacchetto d'esame del feed corrente di una lezione. */
export interface LessonExamPackRow {
  readonly packId: string;
  readonly lessonId: LessonId;
  /** Il documento è stato validato con gli schemi dei contratti al salvataggio. */
  readonly document: ExamPackDocument;
}

/** Banca degli esercizi dello studente per la materia. */
export interface SubjectExamBankRow {
  readonly bankId: string;
  readonly document: ExamBankDocument;
}

/** Contenuti d'esame di una materia, come li legge la persistenza. */
export interface ExamContentRows {
  readonly subjectId: string;
  /** Solo le lezioni il cui feed corrente ha un pacchetto. */
  readonly packs: readonly LessonExamPackRow[];
  readonly bank: SubjectExamBankRow | null;
}

/** Persistenza in lettura dei contenuti d'esame. Le letture rispettano i permessi dello studente. */
export interface ExamContentRepository {
  /**
   * Pacchetti dei feed correnti della materia e banca dello studente.
   *
   * @param userId - Studente.
   * @param subjectId - Materia.
   * @returns I contenuti, oppure `null` se lo studente non vede la materia.
   */
  loadExamContent(userId: UserId, subjectId: string): Promise<ExamContentRows | null>;
}

/** Contenuti d'esame con l'impronta per la cache dell'app. */
export interface ExamContent {
  readonly subjectId: string;
  /**
   * Impronta dei contenuti: cambia solo se cambia un pacchetto o la banca
   * (sono immutabili: un feed nuovo ha un pacchetto nuovo con un altro id).
   */
  readonly version: ContentHash;
  readonly packs: readonly ExamPackDocument[];
  readonly bank: ExamBankDocument | null;
}

/**
 * Caso d'uso **ReadExamContent**: tutto ciò che serve alla sezione Esame per
 * una materia, in una sola lettura, con un'impronta per l'ETag.
 */
export class ReadExamContent {
  /**
   * @param repository - Persistenza dei contenuti d'esame.
   * @param sha256 - Implementazione del digest (per l'impronta).
   */
  constructor(
    private readonly repository: ExamContentRepository,
    private readonly sha256: Sha256 = webCryptoSha256,
  ) {}

  /**
   * @param userId - Studente.
   * @param subjectId - Materia.
   * @returns I contenuti d'esame della materia.
   * @throws {@link DomainError} `NOT_FOUND` se lo studente non vede la materia.
   */
  async execute(userId: UserId, subjectId: string): Promise<ExamContent> {
    const rows = await this.repository.loadExamContent(userId, subjectId);
    if (rows === null) throw new DomainError('NOT_FOUND', 'Materia non trovata');
    const packs = [...rows.packs].sort((a, b) => a.lessonId.localeCompare(b.lessonId));
    const fingerprint = [
      rows.subjectId,
      ...packs.map((pack) => `${pack.lessonId}:${pack.packId}`),
      rows.bank ? `bank:${rows.bank.bankId}` : 'bank:-',
    ];
    return {
      subjectId: rows.subjectId,
      version: await hashCanonical(fingerprint, this.sha256),
      packs: packs.map((pack) => pack.document),
      bank: rows.bank?.document ?? null,
    };
  }
}
