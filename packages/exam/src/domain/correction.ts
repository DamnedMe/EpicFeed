import type { OpenQuestionKind, RubricCriterion } from './exam.js';
import type { FeedIssue } from '@epicfeed/feed';

/**
 * Correzione di Claude delle risposte aperte (M4, ADR 0014 §4 e ADR 0017):
 * cosa lo studente invia, cosa Claude restituisce e le regole che legano le
 * due cose. Sul codice la correzione è fatta di **suggerimenti di revisione**
 * riferiti alle righe della risposta, mostrati come un diff (riga tolta in
 * rosso, riga nuova in verde) con un titolo e una spiegazione.
 */

/** Da dove viene la risposta: un esercizio o la simulazione del colloquio. */
export type SubmissionKind = 'exercise' | 'interview';

/** Una domanda con la risposta dello studente, come arriva a Claude. */
export interface SubmissionItem {
  /** Chiave stabile dell'esercizio nella materia (la stessa dell'app). */
  readonly key: string;
  readonly kind: OpenQuestionKind;
  readonly prompt: string;
  /** Codice dato nella consegna (per `analyze`), se c'è. */
  readonly code: string | null;
  readonly answer: string;
  /** Domanda di approfondimento del colloquio e risposta, se c'è stata. */
  readonly followUp: string | null;
  readonly followUpAnswer: string | null;
  readonly modelAnswer: string;
  readonly rubric: readonly RubricCriterion[];
  readonly conceptKeys: readonly string[];
  /** Esito dei test eseguiti nel browser prima dell'invio, se ci sono stati. */
  readonly tests: { readonly passed: number; readonly total: number } | null;
}

/** Risposte inviate insieme (un esercizio, oppure un colloquio intero). */
export interface ExamSubmissionDraft {
  readonly subjectId: string;
  readonly kind: SubmissionKind;
  readonly items: readonly SubmissionItem[];
}

/**
 * Suggerimento di revisione sul testo della risposta: sostituisce le righe
 * `fromLine`–`toLine` (da 1, comprese) con `replacement`. Una sostituzione
 * vuota toglie le righe.
 */
export interface CodeSuggestion {
  /** Titolo breve, all'imperativo (es. *Use a set for visited nodes*). */
  readonly title: string;
  /** Perché: una o due frasi. */
  readonly explanation: string;
  readonly fromLine: number;
  readonly toLine: number;
  /** Righe nuove, separate da `\n`; vuoto per togliere le righe. */
  readonly replacement: string;
}

/** Correzione di una domanda. */
export interface ItemCorrection {
  readonly key: string;
  /** Punti per criterio della griglia, nello stesso ordine. */
  readonly scores: readonly number[];
  /** Commento generale (complessità, chiarezza, cosa manca). */
  readonly comment: string;
  readonly suggestions: readonly CodeSuggestion[];
}

/** Correzione di un invio, scritta da Claude. */
export interface ExamCorrectionDraft {
  readonly items: readonly ItemCorrection[];
  /** Giudizio d'insieme (per il colloquio: concetti deboli e cosa ripassare). */
  readonly summary: string;
}

/** Limiti degli invii e delle correzioni. */
export const EXAM_CORRECTION_LIMITS = {
  /** Domande per invio: un esercizio, o le domande di un colloquio. */
  items: { min: 1, max: 8 },
  /** Suggerimenti per domanda: i più importanti, non ogni dettaglio. */
  suggestions: { min: 0, max: 8 },
  /** Invii in attesa di correzione per studente. */
  pending: 20,
} as const;

/** Numero di righe di un testo (un testo vuoto ha una riga). */
export function lineCount(text: string): number {
  return text.split('\n').length;
}

/**
 * Controlla che la correzione corrisponda all'invio: una correzione per ogni
 * domanda, punti interi entro quelli di ogni criterio, suggerimenti su righe
 * che esistono nella risposta e che non si sovrappongono.
 *
 * @param draft - Correzione di Claude.
 * @param submission - Invio corretto.
 * @returns I problemi trovati (vuoto se va bene).
 */
export function checkCorrection(
  draft: ExamCorrectionDraft,
  submission: ExamSubmissionDraft,
): FeedIssue[] {
  const issues: FeedIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const byKey = new Map(submission.items.map((item) => [item.key, item]));
  const seen = new Set<string>();

  draft.items.forEach((correction, index) => {
    const path = `items[${index}]`;
    const item = byKey.get(correction.key);
    if (!item) {
      add(`${path}.key`, `Domanda sconosciuta: ${correction.key}`);
      return;
    }
    if (seen.has(correction.key))
      add(`${path}.key`, `Domanda corretta due volte: ${correction.key}`);
    seen.add(correction.key);

    if (correction.scores.length !== item.rubric.length) {
      add(
        `${path}.scores`,
        `Servono ${item.rubric.length} punteggi, uno per criterio, ricevuti ${correction.scores.length}`,
      );
    }
    correction.scores.forEach((score, i) => {
      const max = item.rubric[i]?.points;
      if (max !== undefined && (!Number.isInteger(score) || score < 0 || score > max)) {
        add(`${path}.scores[${i}]`, `Punti da 0 a ${max}, ricevuto ${score}`);
      }
    });

    const lines = lineCount(item.answer);
    const ranges = [...correction.suggestions]
      .map((suggestion, i) => ({ suggestion, i }))
      .sort((a, b) => a.suggestion.fromLine - b.suggestion.fromLine);
    let lastEnd = 0;
    for (const { suggestion, i } of ranges) {
      const at = `${path}.suggestions[${i}]`;
      const { fromLine, toLine } = suggestion;
      if (
        !Number.isInteger(fromLine) ||
        !Number.isInteger(toLine) ||
        fromLine < 1 ||
        toLine < fromLine
      ) {
        add(at, `Righe non valide: ${fromLine}–${toLine}`);
        continue;
      }
      if (toLine > lines)
        add(at, `La risposta ha ${lines} righe, il suggerimento arriva alla ${toLine}`);
      if (fromLine <= lastEnd) add(at, `Si sovrappone a un altro suggerimento (riga ${fromLine})`);
      lastEnd = Math.max(lastEnd, toLine);
      const original = item.answer
        .split('\n')
        .slice(fromLine - 1, toLine)
        .join('\n');
      if (original === suggestion.replacement)
        add(at, 'La sostituzione è uguale al testo originale');
    }
  });

  for (const item of submission.items) {
    if (!seen.has(item.key)) add('items', `Manca la correzione di ${item.key}`);
  }
  return issues;
}

/** Riga del diff di un suggerimento. */
export interface DiffLine {
  readonly type: 'context' | 'removed' | 'added';
  /** Numero di riga nella risposta originale (`null` per le righe aggiunte). */
  readonly oldLine: number | null;
  /** Numero di riga dopo la modifica (`null` per le righe tolte). */
  readonly newLine: number | null;
  readonly text: string;
}

/**
 * Diff di un suggerimento, come in una revisione del codice: qualche riga di
 * contesto, le righe tolte, quelle aggiunte, di nuovo il contesto.
 *
 * @param answer - Risposta originale.
 * @param suggestion - Suggerimento (righe già controllate con {@link checkCorrection}).
 * @param context - Righe di contesto prima e dopo.
 * @returns Le righe del diff.
 */
export function suggestionDiff(
  answer: string,
  suggestion: Pick<CodeSuggestion, 'fromLine' | 'toLine' | 'replacement'>,
  context = 2,
): DiffLine[] {
  const lines = answer.split('\n');
  const from = Math.min(Math.max(suggestion.fromLine, 1), lines.length);
  const to = Math.min(Math.max(suggestion.toLine, from), lines.length);
  const added = suggestion.replacement === '' ? [] : suggestion.replacement.split('\n');
  const shift = added.length - (to - from + 1);
  const out: DiffLine[] = [];
  for (let n = Math.max(1, from - context); n < from; n += 1) {
    out.push({ type: 'context', oldLine: n, newLine: n, text: lines[n - 1] ?? '' });
  }
  for (let n = from; n <= to; n += 1) {
    out.push({ type: 'removed', oldLine: n, newLine: null, text: lines[n - 1] ?? '' });
  }
  added.forEach((text, i) => {
    out.push({ type: 'added', oldLine: null, newLine: from + i, text });
  });
  for (let n = to + 1; n <= Math.min(lines.length, to + context); n += 1) {
    out.push({ type: 'context', oldLine: n, newLine: n + shift, text: lines[n - 1] ?? '' });
  }
  return out;
}
