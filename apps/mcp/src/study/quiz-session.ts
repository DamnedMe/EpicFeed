import type { ChatQuiz, ChatQuizQuestion } from './quiz.js';

/**
 * Andamento di un quiz al volo nella scheda interattiva: domanda corrente,
 * risposte date e riepilogo. Funzioni pure, senza DOM, usate dalla scheda
 * (`view/quiz/`).
 */

/** Dati che la scheda del quiz riceve con il risultato di `quiz_al_volo`. */
export interface QuizViewData {
  readonly quiz: ChatQuiz;
  readonly language: 'it' | 'en';
  /** `false` se le risposte non possono tornare nel ripasso (credenziali mancanti). */
  readonly canRecord: boolean;
  /** Nome dello strumento che registra le risposte. */
  readonly recordTool: string;
}

/** Risposta scelta: indice dell'opzione o vero/falso. */
export type QuizChoice = { readonly index: number } | { readonly value: boolean };

/** Risposta data a una domanda. */
export interface GivenAnswer {
  readonly questionId: string;
  readonly conceptId: string;
  readonly correct: boolean;
  readonly language: 'it' | 'en';
}

/** Stato del quiz. */
export interface QuizSession {
  readonly quiz: ChatQuiz;
  /** Indice della domanda corrente; uguale al numero di domande alla fine. */
  readonly current: number;
  readonly answers: readonly GivenAnswer[];
  /** Risposta alla domanda corrente, se già data (si mostra la spiegazione). */
  readonly revealed: QuizChoice | null;
}

/**
 * Comincia un quiz.
 *
 * @param quiz - Quiz da mostrare.
 * @returns Lo stato iniziale.
 */
export function startSession(quiz: ChatQuiz): QuizSession {
  return { quiz, current: 0, answers: [], revealed: null };
}

/**
 * Domanda corrente.
 *
 * @param session - Stato.
 * @returns La domanda, oppure `null` se il quiz è finito.
 */
export function currentQuestion(session: QuizSession): ChatQuizQuestion | null {
  return session.quiz.questions[session.current] ?? null;
}

/**
 * Dice se una scelta è giusta.
 *
 * @param question - Domanda.
 * @param choice - Scelta dello studente.
 * @returns `true` se è la soluzione.
 */
export function isCorrect(question: ChatQuizQuestion, choice: QuizChoice): boolean {
  if (question.kind === 'multiple_choice') {
    return 'index' in choice && choice.index === question.correctIndex;
  }
  return 'value' in choice && choice.value === question.answer;
}

/**
 * Registra la risposta alla domanda corrente (una sola volta).
 *
 * @param session - Stato.
 * @param choice - Scelta dello studente.
 * @param language - Lingua in cui ha risposto.
 * @returns Il nuovo stato, con la spiegazione da mostrare.
 */
export function answer(
  session: QuizSession,
  choice: QuizChoice,
  language: 'it' | 'en',
): QuizSession {
  const question = currentQuestion(session);
  if (!question || session.revealed) return session;
  return {
    ...session,
    revealed: choice,
    answers: [
      ...session.answers,
      {
        questionId: question.questionId,
        conceptId: question.conceptId,
        correct: isCorrect(question, choice),
        language,
      },
    ],
  };
}

/**
 * Passa alla domanda successiva, dopo la spiegazione.
 *
 * @param session - Stato.
 * @returns Il nuovo stato.
 */
export function next(session: QuizSession): QuizSession {
  if (!session.revealed) return session;
  return { ...session, current: session.current + 1, revealed: null };
}

/**
 * Dice se il quiz è finito.
 *
 * @param session - Stato.
 * @returns `true` dopo l'ultima domanda.
 */
export function isFinished(session: QuizSession): boolean {
  return session.current >= session.quiz.questions.length;
}

/** Riepilogo del quiz. */
export interface QuizSummary {
  readonly right: number;
  readonly total: number;
  /** Concetti sbagliati, senza doppioni, nella lingua del quiz. */
  readonly missed: readonly string[];
}

/**
 * Riepilogo del quiz.
 *
 * @param session - Stato.
 * @param language - Lingua dei nomi dei concetti.
 * @returns Giuste, totale e concetti sbagliati.
 */
export function summarize(session: QuizSession, language: 'it' | 'en'): QuizSummary {
  const names = new Map(session.quiz.questions.map((q) => [q.questionId, q.conceptName[language]]));
  const missed = new Set<string>();
  for (const given of session.answers) {
    if (!given.correct) missed.add(names.get(given.questionId) ?? given.conceptId);
  }
  return {
    right: session.answers.filter((given) => given.correct).length,
    total: session.answers.length,
    missed: [...missed],
  };
}

/**
 * Messaggio per Claude alla fine del quiz.
 *
 * @param session - Stato.
 * @param language - Lingua del quiz.
 * @returns Il testo, da mandare in chat o nel contesto del modello.
 */
export function summaryMessage(session: QuizSession, language: 'it' | 'en'): string {
  const { right, total, missed } = summarize(session, language);
  const head = `Ho finito il quiz di EpicFeed su ${session.quiz.subjectTitle}: ${String(right)} giuste su ${String(total)}.`;
  if (missed.length === 0) return head;
  return `${head} Ho sbagliato: ${missed.join(', ')}. Spiegami questi concetti con le fonti delle mie lezioni.`;
}
