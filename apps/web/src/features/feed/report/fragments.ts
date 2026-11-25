import type { CorrectionField, StoryBeat, StudyLanguage, TextEdit } from '@epicfeed/feed';
import { splitSentences } from '@epicfeed/feed';
import type { FeedEntry } from '../model';

/**
 * Frasi correggibili di una scheda o di una domanda, per il foglio *Segnala
 * errore* (M5, ADR 0020, scelta 1: correggi la frase). Funzioni pure, provate
 * senza DOM.
 */

/** Una frase o un pezzo di testo che si può correggere. */
export interface Fragment {
  readonly field: CorrectionField;
  readonly index?: number | undefined;
  /** Testo come lo vede lo studente. */
  readonly text: string;
  /** Etichetta breve per il foglio (es. «frase chiave», «passo 2»). */
  readonly label: string;
}

const sentences = (text: string, label: string): Fragment[] =>
  splitSentences(text).map((sentence, i, all) => ({
    field: 'body',
    text: sentence,
    label: all.length > 1 ? `${label} ${i + 1}` : label,
  }));

/**
 * Frasi correggibili nell'ordine di lettura. Il codice si corregge riga per
 * riga e non ha lingua; il resto è nella lingua mostrata.
 *
 * @param entry - Scheda o domanda.
 * @param language - Lingua mostrata.
 * @returns Le frasi (mai vuoto: c'è sempre almeno il titolo o la domanda).
 */
export function fragmentsOf(entry: FeedEntry, language: StudyLanguage): Fragment[] {
  if (entry.type === 'quiz') {
    const { quiz } = entry;
    const options =
      quiz.kind === 'multiple_choice'
        ? quiz.options[language].map((text, index): Fragment => ({
            field: 'options',
            index,
            text,
            label: `opzione ${index + 1}`,
          }))
        : [];
    return [
      { field: 'question', text: quiz.question[language], label: 'domanda' },
      ...options,
      { field: 'explanation', text: quiz.explanation[language], label: 'spiegazione' },
    ];
  }
  const { card } = entry;
  const list: Fragment[] = [{ field: 'title', text: card.title[language], label: 'titolo' }];
  if (card.kind === 'comparison' && card.comparison) {
    list.push(
      { field: 'comparisonLeft', text: card.comparison.left[language], label: 'prima idea' },
      { field: 'comparisonRight', text: card.comparison.right[language], label: 'seconda idea' },
    );
  }
  list.push({ field: 'keyPoint', text: card.keyPoint[language], label: 'frase chiave' });
  if (card.kind === 'steps' && card.steps) {
    card.steps[language].forEach((text, index) => {
      list.push({ field: 'steps', index, text, label: `passo ${index + 1}` });
    });
  }
  if (card.kind === 'comparison' && card.comparison) {
    card.comparison.rows.forEach((row, index) => {
      const n = index + 1;
      list.push(
        { field: 'rowAspect', index, text: row.aspect[language], label: `riga ${n}, aspetto` },
        { field: 'rowLeft', index, text: row.left[language], label: `riga ${n}, prima idea` },
        { field: 'rowRight', index, text: row.right[language], label: `riga ${n}, seconda idea` },
      );
    });
  }
  list.push(...sentences(card.body[language], 'spiegazione'));
  if (card.code) {
    card.code.source.split('\n').forEach((line, i) => {
      if (line.trim()) list.push({ field: 'code', text: line, label: `codice, riga ${i + 1}` });
    });
  }
  return list.filter((fragment) => fragment.text.trim().length > 0);
}

/**
 * Frase da proporre per prima: quella della battuta che si stava leggendo.
 *
 * @param fragments - Frasi della scheda ({@link fragmentsOf}).
 * @param beat - Battuta mostrata (`null` per le domande).
 * @returns L'indice in `fragments`.
 */
export function fragmentForBeat(fragments: readonly Fragment[], beat: StoryBeat | null): number {
  if (!beat) return 0;
  const find = (field: CorrectionField, index?: number) =>
    fragments.findIndex((f) => f.field === field && (index === undefined || f.index === index));
  const bodyAt = (n: number) => {
    const positions = fragments.flatMap((f, i) => (f.field === 'body' ? [i] : []));
    return positions[n] ?? positions[0] ?? -1;
  };
  let found = -1;
  switch (beat.kind) {
    case 'title':
      found = find('title');
      break;
    case 'key':
      found = find('keyPoint');
      break;
    case 'line':
    case 'code':
      found = bodyAt(beat.index);
      break;
    case 'note':
      found = bodyAt(0);
      break;
    case 'step':
      found = find('steps', beat.index);
      break;
    case 'row':
      found = find('rowLeft', beat.index);
      break;
  }
  return Math.max(0, found);
}

/**
 * Intervento sul testo per una frase corretta. Per il codice la lingua non
 * conta (si usa quella mostrata).
 *
 * @param fragment - Frase originale.
 * @param corrected - Testo scritto dallo studente.
 * @param language - Lingua mostrata.
 * @returns L'intervento, oppure `null` se il testo è vuoto o invariato.
 */
export function editFor(
  fragment: Fragment,
  corrected: string,
  language: StudyLanguage,
): TextEdit | null {
  const value = fragment.field === 'code' ? corrected.replace(/\s+$/, '') : corrected.trim();
  if (!value || value === fragment.text) return null;
  return {
    field: fragment.field,
    ...(fragment.index === undefined ? {} : { index: fragment.index }),
    language,
    original: fragment.text,
    corrected: value,
  };
}

/** Un termine cambiato: da `from` a `to`. */
export interface TermChange {
  readonly from: string;
  readonly to: string;
}

const WORD = /[\p{L}\p{N}_]/u;

/**
 * Riconosce una correzione che cambia un solo termine (una o poche parole),
 * per proporre di correggerlo in tutta la materia (ADR 0020, scelta 3). Il
 * tratto cambiato si allarga a parole intere.
 *
 * @param original - Frase originale.
 * @param corrected - Frase corretta.
 * @returns Il termine cambiato, oppure `null` se la correzione è più ampia.
 */
export function termChange(original: string, corrected: string): TermChange | null {
  if (original === corrected) return null;
  let start = 0;
  while (
    start < original.length &&
    start < corrected.length &&
    original[start] === corrected[start]
  ) {
    start += 1;
  }
  let endA = original.length;
  let endB = corrected.length;
  while (endA > start && endB > start && original[endA - 1] === corrected[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  // Allarga a parole intere: «Big 0» → «Big O», non «0» → «O».
  while (start > 0 && WORD.test(original[start - 1] ?? '')) start -= 1;
  while (endA < original.length && WORD.test(original[endA] ?? '')) {
    endA += 1;
    endB += 1;
  }
  // Un pezzo troppo corto («0») da solo è ambiguo: si prende anche la parola prima.
  if (original.slice(start, endA).trim().length < 3) {
    while (start > 0 && original[start - 1] === ' ') start -= 1;
    while (start > 0 && WORD.test(original[start - 1] ?? '')) start -= 1;
  }
  const from = original.slice(start, endA).trim();
  const to = corrected.slice(start, endB).trim();
  if (!from || !to || from.length > 40 || to.length > 40) return null;
  if (/[.!?;:]/.test(from) || from.split(/\s+/).length > 4) return null;
  // Se cambia quasi tutta la frase non è un termine, è una frase riscritta.
  if (from.length > original.trim().length * 0.6) return null;
  return { from, to };
}
