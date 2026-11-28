/**
 * Domande in coda per Claude Desktop (M6, ADR 0021, scelta 1): senza chiave
 * API, *Chiedi a Claude* salva la domanda con la scheda a cui si riferisce;
 * Claude Desktop risponde con le fonti della lezione e la risposta torna in
 * *Io › Le mie domande*. Regole pure.
 */

/** Su cosa si chiede: una scheda o una domanda del feed. */
export type QuestionItemType = 'card' | 'quiz';

/** Stato della domanda. */
export type QuestionStatus = 'pending' | 'answered';

/** Domanda dello studente, come la invia l'app. */
export interface QuestionDraft {
  readonly lessonId: string;
  readonly itemType: QuestionItemType;
  /** Id della scheda o della domanda nel feed della lezione. */
  readonly itemId: string;
  readonly question: string;
  /** Lingua in cui lo studente sta studiando: Claude risponde in quella della domanda. */
  readonly language: 'it' | 'en';
}

/** Domanda salvata, con la risposta se è arrivata. */
export interface StoredQuestion extends QuestionDraft {
  readonly id: string;
  readonly subjectId: string;
  readonly status: QuestionStatus;
  readonly answer: string | null;
  readonly createdAt: string;
  readonly answeredAt: string | null;
}

/** Limiti delle domande. */
export const QUESTION_LIMITS = {
  /** Caratteri di una domanda. */
  question: 1000,
  /** Caratteri di una risposta di Claude. */
  answer: 6000,
  /** Domande in attesa per studente: oltre si aspetta che Claude risponda. */
  pending: 30,
  /** Domande conservate per studente. */
  total: 300,
  /** Domande consegnate a Claude in una volta. */
  batch: 5,
} as const;

/**
 * Controlla la domanda (oltre alla forma, già verificata dai contratti).
 *
 * @param draft - Domanda.
 * @returns I problemi, vuoto se va bene.
 */
export function checkQuestion(draft: QuestionDraft): string[] {
  const issues: string[] = [];
  const text = draft.question.trim();
  if (text.length === 0) issues.push('La domanda è vuota.');
  if (text.length > QUESTION_LIMITS.question) {
    issues.push(`La domanda supera ${String(QUESTION_LIMITS.question)} caratteri.`);
  }
  return issues;
}

/**
 * Controlla la risposta di Claude.
 *
 * @param answer - Risposta.
 * @returns I problemi, vuoto se va bene.
 */
export function checkAnswer(answer: string): string[] {
  const text = answer.trim();
  if (text.length === 0) return ['La risposta è vuota.'];
  if (text.length > QUESTION_LIMITS.answer) {
    return [`La risposta supera ${String(QUESTION_LIMITS.answer)} caratteri: accorciala.`];
  }
  return [];
}
