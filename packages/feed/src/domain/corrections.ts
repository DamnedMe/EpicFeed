import type { StudyLanguage } from './feed.js';
import { STUDY_LANGUAGES } from './feed.js';

/**
 * Segnala errore (M5, ADR 0006 punto 3 e ADR 0020): correzioni personali alle
 * schede e alle domande del feed.
 *
 * Il feed di una lezione è uno solo per tutti quelli che l'hanno importata;
 * le correzioni di uno studente stanno a parte e si applicano sul dispositivo
 * mentre si disegnano le schede. Qui stanno solo regole pure: forma di una
 * correzione, come applicarla a un feed (anche a una versione nuova della
 * lezione) e come contare un termine ripetuto nella materia.
 */

/** Motivo scelto nel foglio *Segnala errore*. */
export type CorrectionReason = 'content' | 'translation' | 'code' | 'unclear';

/** Motivi ammessi, nell'ordine dei pulsanti. */
export const CORRECTION_REASONS: readonly CorrectionReason[] = [
  'content',
  'translation',
  'code',
  'unclear',
];

/** Campi correggibili di una scheda. */
export type CardField =
  | 'title'
  | 'keyPoint'
  | 'body'
  | 'steps'
  | 'comparisonLeft'
  | 'comparisonRight'
  | 'rowAspect'
  | 'rowLeft'
  | 'rowRight'
  | 'code';

/** Campi correggibili di una domanda. */
export type QuizField = 'question' | 'explanation' | 'options';

/** Campo di un elemento del feed. */
export type CorrectionField = CardField | QuizField;

/** Campi delle schede, per la validazione. */
export const CARD_FIELDS: readonly CardField[] = [
  'title',
  'keyPoint',
  'body',
  'steps',
  'comparisonLeft',
  'comparisonRight',
  'rowAspect',
  'rowLeft',
  'rowRight',
  'code',
];

/** Campi delle domande, per la validazione. */
export const QUIZ_FIELDS: readonly QuizField[] = ['question', 'explanation', 'options'];

/** Campi che sono elenchi: l'intervento indica anche la posizione. */
export const INDEXED_FIELDS: readonly CorrectionField[] = [
  'steps',
  'rowAspect',
  'rowLeft',
  'rowRight',
  'options',
];

/** Elemento del feed a cui si riferisce una correzione. */
export type ItemType = 'card' | 'quiz';

/**
 * Un intervento sul testo: in un campo e in una lingua, `original` diventa
 * `corrected`. `original` è un tratto del campo (di solito la frase della
 * battuta che si stava leggendo), non per forza tutto il campo. Il codice non
 * si traduce: per il campo `code` la lingua non conta.
 */
export interface TextEdit {
  readonly field: CorrectionField;
  /** Posizione nell'elenco, solo per i campi di {@link INDEXED_FIELDS}. */
  readonly index?: number | undefined;
  readonly language: StudyLanguage;
  readonly original: string;
  readonly corrected: string;
}

/** Risposta giusta indicata dallo studente per una domanda. */
export type AnswerFix =
  | {
      readonly kind: 'multiple_choice';
      readonly correctIndex: number;
      /** Testo dell'opzione giusta, per ritrovarla in una versione nuova della domanda. */
      readonly option: { readonly [L in StudyLanguage]: string };
    }
  | { readonly kind: 'true_false'; readonly answer: boolean };

/**
 * Correzione come la crea lo studente.
 *
 * - `text`: la frase corretta, in una lingua (l'altra la allinea Claude).
 * - `regenerate`: *Non so la correzione: rifalla da capo*, la scrive Claude.
 * - `answer`: la risposta giusta di una domanda è un'altra.
 * - `term`: un termine scritto male, corretto in tutte le schede della materia.
 *
 * Le correzioni di una lezione portano `snapshot`, l'elemento come lo vedeva
 * lo studente: serve a Claude per capire il contesto e trovare la stessa frase
 * nell'altra lingua.
 */
export type CorrectionDraft =
  | {
      readonly kind: 'text';
      readonly lessonId: string;
      readonly itemType: ItemType;
      readonly itemId: string;
      readonly edits: readonly TextEdit[];
      readonly reason: CorrectionReason;
      readonly snapshot: unknown;
    }
  | {
      readonly kind: 'regenerate';
      readonly lessonId: string;
      readonly itemType: ItemType;
      readonly itemId: string;
      readonly reason: CorrectionReason;
      readonly snapshot: unknown;
    }
  | {
      readonly kind: 'answer';
      readonly lessonId: string;
      readonly itemId: string;
      readonly fix: AnswerFix;
      /** Domanda nelle due lingue, per ritrovarla in una versione nuova. */
      readonly question: { readonly [L in StudyLanguage]: string };
      readonly reason: CorrectionReason;
      readonly snapshot: unknown;
    }
  | {
      readonly kind: 'term';
      readonly from: string;
      readonly to: string;
      readonly reason: CorrectionReason;
    };

/** Tipo di correzione. */
export type CorrectionKind = CorrectionDraft['kind'];

/**
 * Lavoro di Claude su una correzione:
 * - `pending`: da completare (altra lingua da allineare o scheda da rifare);
 * - `done`: completata, gli interventi di Claude sono in `completion`;
 * - `disputed`: la correzione non trova riscontro nei riassunti; resta
 *   applicata e lo studente la rivede con la nota di Claude;
 * - `not_needed`: niente da fare per Claude.
 */
export type ClaudeStatus = 'pending' | 'done' | 'disputed' | 'not_needed';

/** Esito del lavoro di Claude. */
export type CorrectionCompletion =
  | { readonly outcome: 'done'; readonly edits: readonly TextEdit[] }
  | {
      readonly outcome: 'disputed';
      /** Perché non torna, in italiano. */
      readonly note: string;
      /** Passaggio del riassunto che la contraddice. */
      readonly evidence?: string | undefined;
    };

/** Correzione salvata, come la vede lo studente e Claude Desktop. */
export interface StoredCorrection {
  readonly id: string;
  readonly subjectId: string;
  readonly correction: CorrectionDraft;
  readonly claudeStatus: ClaudeStatus;
  readonly completion: CorrectionCompletion | null;
  /** Istante di creazione in formato ISO 8601: le correzioni si applicano in quest'ordine. */
  readonly createdAt: string;
}

/** Limiti delle correzioni. */
export const CORRECTION_LIMITS = {
  /** Correzioni per studente: oltre, si chiede di annullarne qualcuna. */
  perUser: 1000,
  /** Lunghezza di `original` e `corrected` (il codice arriva a 2.000 caratteri). */
  text: 2_000,
  /** Lunghezza di un termine. */
  term: 80,
  /** Interventi di una correzione (una scheda rifatta da Claude ne ha diversi). */
  edits: 24,
  /** Nota di Claude. */
  note: 600,
} as const;

/** Problema trovato nella forma di una correzione. */
export interface CorrectionIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Stato iniziale del lavoro di Claude: serve solo quando lo studente ha
 * corretto una lingua sola (ADR 0020, scelta 2) o ha chiesto di rifare la
 * scheda. Il codice non ha lingua e le risposte e i termini valgono per
 * entrambe.
 *
 * @param draft - Correzione dello studente.
 * @returns Lo stato iniziale.
 */
export function initialClaudeStatus(draft: CorrectionDraft): ClaudeStatus {
  if (draft.kind === 'regenerate') return 'pending';
  if (draft.kind !== 'text') return 'not_needed';
  return missingLanguageEdits(draft.edits).length > 0 ? 'pending' : 'not_needed';
}

/**
 * Interventi a cui manca la controparte nell'altra lingua.
 *
 * @param edits - Interventi.
 * @returns Gli interventi da allineare (mai quelli sul codice).
 */
export function missingLanguageEdits(edits: readonly TextEdit[]): TextEdit[] {
  return edits.filter(
    (edit) =>
      edit.field !== 'code' &&
      !edits.some(
        (other) =>
          other.field === edit.field &&
          other.index === edit.index &&
          other.language !== edit.language,
      ),
  );
}

/**
 * Controlla le regole di una correzione dello studente che lo schema non
 * esprime: campi coerenti con il tipo di elemento, posizioni negli elenchi,
 * testo davvero cambiato, una sola correzione per campo e lingua.
 *
 * @param draft - Correzione già validata nella forma.
 * @returns I problemi trovati (vuoto se va bene).
 */
export function checkCorrectionDraft(draft: CorrectionDraft): CorrectionIssue[] {
  if (draft.kind === 'term') {
    return draft.from.trim() === draft.to.trim()
      ? [{ path: 'to', message: 'Il termine corretto è uguale a quello sbagliato' }]
      : [];
  }
  if (draft.kind === 'text') return checkEdits(draft.itemType, draft.edits, 'edits');
  return [];
}

/**
 * Controlla gli interventi di Claude su una correzione in attesa: per una
 * frase corretta in una lingua serve la stessa frase nell'altra; per una
 * scheda da rifare serve almeno un intervento.
 *
 * @param correction - Correzione salvata.
 * @param completion - Esito proposto da Claude.
 * @returns I problemi trovati (vuoto se va bene).
 */
export function checkCompletion(
  correction: CorrectionDraft,
  completion: CorrectionCompletion,
): CorrectionIssue[] {
  if (completion.outcome === 'disputed') return [];
  if (correction.kind !== 'text' && correction.kind !== 'regenerate') {
    return [{ path: 'outcome', message: 'Questa correzione non ha bisogno di Claude' }];
  }
  const issues = checkEdits(correction.itemType, completion.edits, 'edits');
  if (correction.kind === 'text') {
    for (const missing of missingLanguageEdits(correction.edits)) {
      const covered = completion.edits.some(
        (edit) =>
          edit.field === missing.field &&
          edit.index === missing.index &&
          edit.language !== missing.language,
      );
      if (!covered) {
        issues.push({
          path: 'edits',
          message: `Manca la correzione in ${missing.language === 'it' ? 'inglese' : 'italiano'} del campo ${missing.field}`,
        });
      }
    }
  }
  return issues;
}

function checkEdits(itemType: ItemType, edits: readonly TextEdit[], path: string) {
  const issues: CorrectionIssue[] = [];
  if (edits.length === 0) issues.push({ path, message: 'Serve almeno una correzione' });
  const allowed: readonly CorrectionField[] = itemType === 'card' ? CARD_FIELDS : QUIZ_FIELDS;
  const seen = new Set<string>();
  edits.forEach((edit, i) => {
    const at = `${path}.${i}`;
    if (!allowed.includes(edit.field)) {
      issues.push({
        path: `${at}.field`,
        message: `Campo ${edit.field} non valido per ${itemType}`,
      });
    }
    const indexed = INDEXED_FIELDS.includes(edit.field);
    if (indexed !== (edit.index !== undefined)) {
      issues.push({
        path: `${at}.index`,
        message: indexed ? 'Serve la posizione nell’elenco' : 'Questo campo non ha posizioni',
      });
    }
    if (edit.original === edit.corrected) {
      issues.push({ path: `${at}.corrected`, message: 'Il testo corretto è uguale all’originale' });
    }
    const key = `${edit.field}:${edit.index ?? ''}:${edit.field === 'code' ? '' : edit.language}:${edit.original}`;
    if (seen.has(key)) issues.push({ path: at, message: 'Correzione ripetuta' });
    seen.add(key);
  });
  return issues;
}

/* ------------------------------------------------------------------------ */
/* Applicazione al feed                                                     */
/* ------------------------------------------------------------------------ */

type Text = { readonly [L in StudyLanguage]: string };
type TextList = { readonly [L in StudyLanguage]: readonly string[] };

/** Campi di una scheda che le correzioni toccano (vale sia per il dominio sia per i dati dell'API). */
export interface CorrectableCard {
  readonly id: string;
  readonly title: Text;
  readonly keyPoint: Text;
  readonly body: Text;
  readonly steps?: TextList | undefined;
  readonly comparison?:
    | {
        readonly left: Text;
        readonly right: Text;
        readonly rows: readonly {
          readonly aspect: Text;
          readonly left: Text;
          readonly right: Text;
        }[];
      }
    | undefined;
  readonly code?: { readonly language: string; readonly source: string } | undefined;
  readonly terms: readonly string[];
}

/** Campi di una domanda che le correzioni toccano. */
export type CorrectableQuiz =
  | {
      readonly id: string;
      readonly kind: 'multiple_choice';
      readonly question: Text;
      readonly explanation: Text;
      readonly options: TextList;
      readonly correctIndex: number;
    }
  | {
      readonly id: string;
      readonly kind: 'true_false';
      readonly question: Text;
      readonly explanation: Text;
      readonly answer: boolean;
    };

/** Feed di una lezione a cui applicare le correzioni. */
export interface CorrectableFeed {
  readonly cards: readonly CorrectableCard[];
  readonly quiz: readonly CorrectableQuiz[];
  readonly concepts: readonly { readonly name: Text; readonly description: Text }[];
}

/**
 * Esito di una correzione su un feed:
 * - `applied`: il testo sbagliato c'era ed è stato sostituito;
 * - `already`: il feed dice già la cosa giusta (es. lezione rigenerata);
 * - `missing`: la frase sbagliata non c'è più, va ricontrollata.
 */
export type CorrectionOutcome = 'applied' | 'already' | 'missing';

/** Feed corretto, con l'esito di ogni correzione e gli elementi toccati. */
export interface CorrectedFeed<T extends CorrectableFeed> {
  readonly feed: T;
  /** Esito per id di correzione (solo quelle che riguardano questa lezione). */
  readonly outcomes: ReadonlyMap<string, CorrectionOutcome>;
  /** Id delle schede e domande cambiate da una correzione (segno *Corretta da te*). */
  readonly correctedItems: ReadonlySet<string>;
}

type MutableFeed = {
  cards: Record<string, unknown>[];
  quiz: Record<string, unknown>[];
  concepts: Record<string, unknown>[];
};

/**
 * Applica a un feed di lezione le correzioni dello studente, in ordine di
 * creazione. Le correzioni di altre lezioni si ignorano; quelle di un termine
 * valgono in ogni lezione della materia. Il feed di partenza non cambia: si
 * restituisce una copia.
 *
 * Una correzione resta valida anche quando la lezione viene rigenerata: si
 * cerca il testo sbagliato prima nello stesso elemento e poi negli elementi
 * dello stesso tipo della lezione. Se non c'è più, l'esito è `missing` e lo
 * studente la ritrova *da ricontrollare*.
 *
 * @param feed - Feed della lezione.
 * @param lessonId - Lezione del feed.
 * @param corrections - Correzioni dello studente (anche di altre lezioni).
 * @returns Il feed corretto con gli esiti.
 */
export function applyCorrections<T extends CorrectableFeed>(
  feed: T,
  lessonId: string,
  corrections: readonly StoredCorrection[],
): CorrectedFeed<T> {
  const copy = structuredClone(feed) as unknown as MutableFeed;
  const outcomes = new Map<string, CorrectionOutcome>();
  const correctedItems = new Set<string>();
  const ordered = [...corrections].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
  for (const stored of ordered) {
    const draft = stored.correction;
    if (draft.kind === 'term') {
      const changed = replaceTerm(copy, draft.from, draft.to);
      for (const id of changed) correctedItems.add(id);
      continue;
    }
    if (draft.lessonId !== lessonId) continue;
    if (draft.kind === 'answer') {
      const result = applyAnswer(copy, draft);
      outcomes.set(stored.id, result.outcome);
      if (result.itemId) correctedItems.add(result.itemId);
      continue;
    }
    const edits = [
      ...(draft.kind === 'text' ? draft.edits : []),
      ...(stored.completion?.outcome === 'done' ? stored.completion.edits : []),
    ];
    // Una scheda da rifare senza ancora gli interventi di Claude non cambia nulla.
    if (edits.length === 0) continue;
    const results = edits.map((edit) => applyEdit(copy, draft.itemType, draft.itemId, edit));
    outcomes.set(stored.id, combine(results.map((r) => r.outcome)));
    for (const r of results) if (r.itemId && r.outcome === 'applied') correctedItems.add(r.itemId);
  }
  return { feed: copy as unknown as T, outcomes, correctedItems };
}

function combine(outcomes: CorrectionOutcome[]): CorrectionOutcome {
  if (outcomes.includes('missing')) return 'missing';
  return outcomes.includes('applied') ? 'applied' : 'already';
}

/** Legge o scrive il testo di un campo in una lingua; `null` se il campo non c'è. */
function fieldAccess(
  item: Record<string, unknown>,
  edit: TextEdit,
): { get: () => string; set: (value: string) => void } | null {
  const { field, index, language } = edit;
  const bilingual = (key: string) => {
    const value = item[key] as Record<StudyLanguage, string> | undefined;
    if (!value || typeof value[language] !== 'string') return null;
    return { get: () => value[language], set: (v: string) => (value[language] = v) };
  };
  const listItem = (list: Record<StudyLanguage, string[]> | undefined) => {
    const values = list?.[language];
    if (!values || index === undefined || typeof values[index] !== 'string') return null;
    return { get: () => values[index] as string, set: (v: string) => (values[index] = v) };
  };
  const comparison = item.comparison as
    | {
        left: Record<StudyLanguage, string>;
        right: Record<StudyLanguage, string>;
        rows: Record<'aspect' | 'left' | 'right', Record<StudyLanguage, string>>[];
      }
    | undefined;
  const rowCell = (cell: 'aspect' | 'left' | 'right') => {
    const row = index === undefined ? undefined : comparison?.rows[index];
    const value = row?.[cell];
    if (!value) return null;
    return { get: () => value[language], set: (v: string) => (value[language] = v) };
  };
  switch (field) {
    case 'title':
    case 'keyPoint':
    case 'body':
    case 'question':
    case 'explanation':
      return bilingual(field);
    case 'steps':
    case 'options':
      return listItem(item[field] as Record<StudyLanguage, string[]> | undefined);
    case 'comparisonLeft':
    case 'comparisonRight': {
      const value = comparison?.[field === 'comparisonLeft' ? 'left' : 'right'];
      if (!value) return null;
      return { get: () => value[language], set: (v: string) => (value[language] = v) };
    }
    case 'rowAspect':
      return rowCell('aspect');
    case 'rowLeft':
      return rowCell('left');
    case 'rowRight':
      return rowCell('right');
    case 'code': {
      const code = item.code as { source: string } | undefined;
      if (!code) return null;
      return { get: () => code.source, set: (v: string) => (code.source = v) };
    }
  }
}

/** Prova un intervento su un elemento: sostituisce la prima occorrenza del testo sbagliato. */
function tryEdit(item: Record<string, unknown>, edit: TextEdit): CorrectionOutcome {
  const access = fieldAccess(item, edit);
  if (!access) return 'missing';
  const text = access.get();
  if (text.includes(edit.original)) {
    access.set(text.replace(edit.original, () => edit.corrected));
    return 'applied';
  }
  return text.includes(edit.corrected) ? 'already' : 'missing';
}

function applyEdit(
  feed: MutableFeed,
  itemType: ItemType,
  itemId: string,
  edit: TextEdit,
): { outcome: CorrectionOutcome; itemId: string | null } {
  const items = itemType === 'card' ? feed.cards : feed.quiz;
  const own = items.find((item) => item.id === itemId);
  let fallback: CorrectionOutcome = 'missing';
  if (own) {
    const outcome = tryEdit(own, edit);
    if (outcome === 'applied') return { outcome, itemId };
    fallback = outcome;
  }
  // Lezione rigenerata: la stessa frase può stare in un elemento con un altro id.
  for (const item of items) {
    if (item === own) continue;
    const access = fieldAccess(item, edit);
    if (access?.get().includes(edit.original)) {
      tryEdit(item, edit);
      return { outcome: 'applied', itemId: String(item.id) };
    }
  }
  return { outcome: fallback, itemId: null };
}

function applyAnswer(
  feed: MutableFeed,
  draft: Extract<CorrectionDraft, { kind: 'answer' }>,
): { outcome: CorrectionOutcome; itemId: string | null } {
  const sameQuestion = (item: Record<string, unknown>) => {
    const question = item.question as Text | undefined;
    return (
      question !== undefined &&
      STUDY_LANGUAGES.some((l) => sameText(question[l], draft.question[l]))
    );
  };
  // Prima l'elemento con lo stesso id e la stessa domanda, poi la stessa domanda altrove.
  const item =
    feed.quiz.find((q) => q.id === draft.itemId && sameQuestion(q)) ?? feed.quiz.find(sameQuestion);
  if (!item || item.kind !== draft.fix.kind) return { outcome: 'missing', itemId: null };
  const id = String(item.id);
  if (draft.fix.kind === 'true_false') {
    if (item.answer === draft.fix.answer) return { outcome: 'already', itemId: null };
    item.answer = draft.fix.answer;
    return { outcome: 'applied', itemId: id };
  }
  const options = item.options as TextList;
  const { option } = draft.fix;
  const index = options.it.findIndex(
    (text, i) => sameText(text, option.it) || sameText(options.en[i] ?? '', option.en),
  );
  if (index < 0) return { outcome: 'missing', itemId: null };
  if (item.correctIndex === index) return { outcome: 'already', itemId: null };
  item.correctIndex = index;
  return { outcome: 'applied', itemId: id };
}

function sameText(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(a) === norm(b);
}

/* ------------------------------------------------------------------------ */
/* Termini                                                                  */
/* ------------------------------------------------------------------------ */

/** Espressione che trova il termine come parola intera (lettere e cifre di ogni alfabeto). */
function termPattern(term: string): RegExp {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu');
}

/** Testi bilingui di una scheda o di una domanda in cui si cercano i termini (mai il codice). */
function termTargets(item: Record<string, unknown>): Record<StudyLanguage, unknown>[] {
  const targets: Record<StudyLanguage, unknown>[] = [];
  for (const key of [
    'title',
    'keyPoint',
    'body',
    'question',
    'explanation',
    'name',
    'description',
  ]) {
    const value = item[key] as Record<StudyLanguage, unknown> | undefined;
    if (value) targets.push(value);
  }
  for (const key of ['steps', 'options']) {
    const value = item[key] as Record<StudyLanguage, unknown> | undefined;
    if (value) targets.push(value);
  }
  const comparison = item.comparison as
    | {
        left: Record<StudyLanguage, unknown>;
        right: Record<StudyLanguage, unknown>;
        rows: Record<string, Record<StudyLanguage, unknown>>[];
      }
    | undefined;
  if (comparison) {
    targets.push(comparison.left, comparison.right);
    for (const row of comparison.rows) {
      for (const cell of [row.aspect, row.left, row.right]) if (cell) targets.push(cell);
    }
  }
  return targets;
}

/** Sostituisce il termine in ogni testo; restituisce gli id degli elementi cambiati. */
function replaceTerm(feed: MutableFeed, from: string, to: string): string[] {
  const pattern = termPattern(from);
  const changed: string[] = [];
  const visit = (item: Record<string, unknown>) => {
    let touched = false;
    for (const target of termTargets(item)) {
      for (const language of STUDY_LANGUAGES) {
        const value = target[language];
        if (typeof value === 'string') {
          const next = value.replace(pattern, () => to);
          if (next !== value) {
            target[language] = next;
            touched = true;
          }
        } else if (Array.isArray(value)) {
          value.forEach((entry: unknown, i) => {
            if (typeof entry !== 'string') return;
            const next = entry.replace(pattern, () => to);
            if (next !== entry) {
              value[i] = next;
              touched = true;
            }
          });
        }
      }
    }
    const terms = item.terms as string[] | undefined;
    if (terms) {
      terms.forEach((term, i) => {
        if (term.trim() === from.trim()) {
          terms[i] = to;
          touched = true;
        }
      });
    }
    if (touched && typeof item.id === 'string') changed.push(item.id);
  };
  feed.cards.forEach(visit);
  feed.quiz.forEach(visit);
  feed.concepts.forEach(visit);
  return changed;
}

/** Quante volte compare un termine nei feed di una materia. */
export interface TermUsage {
  /** Schede e domande che lo contengono. */
  readonly items: number;
  /** Lezioni che lo contengono. */
  readonly lessons: number;
  /** Titoli delle lezioni, nell'ordine dei feed. */
  readonly lessonTitles: readonly string[];
}

/**
 * Conta dove compare un termine nella materia, per la conferma *compare in
 * altre N schede* prima di correggerlo ovunque (ADR 0020, scelta 3).
 *
 * @param feeds - Feed delle lezioni della materia, con il titolo della lezione.
 * @param term - Termine sbagliato.
 * @returns Schede e lezioni che lo contengono.
 */
export function countTermUsage(
  feeds: readonly { readonly title: string; readonly feed: CorrectableFeed }[],
  term: string,
): TermUsage {
  if (!term.trim()) return { items: 0, lessons: 0, lessonTitles: [] };
  let items = 0;
  const lessonTitles: string[] = [];
  for (const { title, feed } of feeds) {
    const copy = structuredClone(feed) as unknown as MutableFeed;
    const changed = new Set(replaceTerm(copy, term, `\u0000`));
    if (changed.size > 0) {
      items += changed.size;
      lessonTitles.push(title);
    }
  }
  return { items, lessons: lessonTitles.length, lessonTitles };
}
