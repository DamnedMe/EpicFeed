import type { Bilingual, ConceptKey, FeedIssue } from './feed.js';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from './feed.js';

/**
 * Pacchetto d'esame di una lezione (M4, ADR 0014 e ADR 0017): domande a
 * scelta multipla in più per il quiz di modulo da 50 e domande aperte "stile
 * esame" con soluzione modello e griglia. Tutto in inglese, come all'esame;
 * solo i suggerimenti sono in italiano e in inglese.
 *
 * Il pacchetto è separato dal feed della lezione: le schede e le domande del
 * feed già studiate non cambiano. Si appoggia ai concetti del feed, con le
 * stesse chiavi, così ogni risposta aggiorna il ripasso dello stesso concetto.
 */

/** Domanda a scelta multipla d'esame (solo inglese). */
export interface ExamChoiceQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correctIndex: number;
  /** Perché la risposta giusta è giusta. */
  readonly explanation: string;
  readonly conceptKey: ConceptKey;
  /** 1 facile, 2 media, 3 difficile. */
  readonly difficulty: 1 | 2 | 3;
}

/** Tipo di domanda aperta: scrivere codice, spiegare, analizzare (es. complessità). */
export type OpenQuestionKind = 'code' | 'explain' | 'analyze';

/** Test di un esercizio di codice: chiamata Python e risultato atteso (`repr`). */
export interface CodeTest {
  /** Espressione Python, es. `is_balanced("([])")`. */
  readonly call: string;
  /** Risultato atteso come lo stampa `repr`, es. `True`. */
  readonly expected: string;
}

/** Criterio della griglia di correzione. */
export interface RubricCriterion {
  readonly criterion: string;
  readonly points: number;
}

/** Domanda aperta stile esame. */
export interface ExamOpenQuestion {
  readonly id: string;
  readonly kind: OpenQuestionKind;
  /** Testo della domanda (markdown). */
  readonly prompt: string;
  /** Codice da analizzare (solo `analyze`). */
  readonly code?: string | undefined;
  /** Firma della funzione da scrivere, es. `def is_balanced(s: str) -> bool:` (solo `code`). */
  readonly signature?: string | undefined;
  /** Test eseguibili nel browser (solo `code`). */
  readonly tests?: readonly CodeTest[] | undefined;
  /** Suggerimenti progressivi, nelle due lingue. */
  readonly hints: readonly Bilingual[];
  /** Soluzione modello (markdown, con il codice se serve). */
  readonly modelAnswer: string;
  readonly rubric: readonly RubricCriterion[];
  readonly conceptKeys: readonly ConceptKey[];
  /** Domanda di approfondimento per la simulazione del colloquio. */
  readonly followUp: string;
}

/** Pacchetto d'esame come lo produce Claude. */
export interface ExamPackDraft {
  readonly questions: readonly ExamChoiceQuestion[];
  readonly openQuestions: readonly ExamOpenQuestion[];
}

/** Pacchetto d'esame salvato: il pacchetto più il feed a cui appartiene. */
export interface ExamPackDocument extends ExamPackDraft {
  readonly lessonId: string;
  /** Feed della lezione da cui è nato (ne usa i concetti). */
  readonly feedId: string;
  readonly promptVersion: string;
  readonly generatedAt: string;
}

/**
 * Quantità per lezione: 10 domande a scelta multipla in più (con le 6–8 del
 * feed fanno le ~90 per modulo da cui il quiz pesca 50) e 1–2 domande aperte.
 * Come per il feed, i limiti sono un po' più larghi dell'obiettivo del prompt.
 */
export const EXAM_PACK_LIMITS = {
  questions: { min: 8, max: 12 },
  openQuestions: { min: 1, max: 2 },
  options: { min: 4, max: 4 },
  hints: { min: 1, max: 3 },
  rubric: { min: 3, max: 5 },
  rubricPoints: { min: 1, max: 5 },
  tests: { min: 2, max: 8 },
  openConcepts: { min: 1, max: 3 },
} as const;

/** Contesto per controllare un pacchetto: il feed della lezione. */
export interface ExamPackCheckContext {
  /** Chiavi dei concetti del feed della lezione. */
  readonly conceptKeys: ReadonlySet<string>;
  /** Domande già nel feed (testo inglese), da non ripetere. */
  readonly feedQuestions: readonly string[];
}

type AddIssue = (path: string, message: string) => void;

function checkCount(
  count: number,
  limits: { readonly min: number; readonly max: number },
  path: string,
  label: string,
  add: AddIssue,
): void {
  if (count < limits.min || count > limits.max) {
    const range = limits.min === limits.max ? `${limits.min}` : `da ${limits.min} a ${limits.max}`;
    add(path, `Servono ${range} ${label}, ricevute ${count}`);
  }
}

/** Id in kebab-case e unici in tutto il pacchetto (domande chiuse e aperte insieme). */
function checkIds(draft: ExamPackDraft, add: AddIssue): void {
  const seen = new Set<string>();
  const items = [
    ...draft.questions.map((item, i) => ({ id: item.id, path: `questions[${i}].id` })),
    ...draft.openQuestions.map((item, i) => ({ id: item.id, path: `openQuestions[${i}].id` })),
  ];
  for (const { id, path } of items) {
    if (id.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(id)) {
      add(path, `"${id}" deve essere in kebab-case`);
    }
    if (seen.has(id)) add(path, `Id ripetuto: ${id}`);
    seen.add(id);
  }
}

/** Testo confrontabile: minuscolo, solo lettere e cifre separate da uno spazio. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function checkChoice(
  item: ExamChoiceQuestion,
  path: string,
  context: ExamPackCheckContext,
  feedQuestions: ReadonlySet<string>,
  add: AddIssue,
): void {
  if (!context.conceptKeys.has(item.conceptKey)) {
    add(`${path}.conceptKey`, `Concetto inesistente nel feed della lezione: ${item.conceptKey}`);
  }
  checkCount(item.options.length, EXAM_PACK_LIMITS.options, `${path}.options`, 'opzioni', add);
  if (
    !Number.isInteger(item.correctIndex) ||
    item.correctIndex < 0 ||
    item.correctIndex >= item.options.length
  ) {
    add(`${path}.correctIndex`, 'La risposta corretta non è tra le opzioni');
  }
  const options = item.options.map(normalize);
  if (new Set(options).size !== options.length) add(`${path}.options`, 'Due opzioni sono uguali');
  if (feedQuestions.has(normalize(item.question))) {
    add(`${path}.question`, 'Domanda già presente nel feed della lezione: scrivine una nuova');
  }
}

/**
 * Regole di una domanda aperta, comuni ai pacchetti delle lezioni e alla
 * banca degli esercizi della materia.
 *
 * @param conceptKeys - Concetti ammessi.
 * @param scope - Dove stanno i concetti ammessi, per il messaggio.
 */
function checkOpen(
  item: ExamOpenQuestion,
  path: string,
  conceptKeys: ReadonlySet<string>,
  scope: string,
  add: AddIssue,
): void {
  checkCount(item.hints.length, EXAM_PACK_LIMITS.hints, `${path}.hints`, 'suggerimenti', add);
  checkCount(item.rubric.length, EXAM_PACK_LIMITS.rubric, `${path}.rubric`, 'criteri', add);
  item.rubric.forEach((criterion, i) => {
    const { min, max } = EXAM_PACK_LIMITS.rubricPoints;
    if (!Number.isInteger(criterion.points) || criterion.points < min || criterion.points > max) {
      add(`${path}.rubric[${i}].points`, `Punti da ${min} a ${max}`);
    }
  });
  checkCount(
    item.conceptKeys.length,
    EXAM_PACK_LIMITS.openConcepts,
    `${path}.conceptKeys`,
    'concetti',
    add,
  );
  item.conceptKeys.forEach((key, i) => {
    if (!conceptKeys.has(key)) {
      add(`${path}.conceptKeys[${i}]`, `Concetto inesistente ${scope}: ${key}`);
    }
  });
  if (item.kind === 'code') {
    if (!item.signature)
      add(`${path}.signature`, 'Un esercizio di codice ha la firma della funzione');
    checkCount(item.tests?.length ?? 0, EXAM_PACK_LIMITS.tests, `${path}.tests`, 'test', add);
  } else if (item.tests && item.tests.length > 0) {
    add(`${path}.tests`, 'I test servono solo agli esercizi di codice');
  }
  if (item.kind === 'analyze' && !item.code) {
    add(`${path}.code`, 'Una domanda di analisi riporta il codice da analizzare');
  }
}

/**
 * Controlla le regole di un pacchetto d'esame che la sola forma non garantisce.
 * Come `checkLessonFeed`, non lancia: restituisce tutti i problemi, così Claude
 * li corregge in una volta.
 *
 * @param draft - Pacchetto già validato nella forma (schemi zod).
 * @param context - Concetti e domande del feed della lezione.
 * @returns L'elenco dei problemi; vuoto se il pacchetto è coerente.
 */
export function checkExamPack(draft: ExamPackDraft, context: ExamPackCheckContext): FeedIssue[] {
  const issues: FeedIssue[] = [];
  const add: AddIssue = (path, message) => {
    issues.push({ path, message });
  };
  checkCount(
    draft.questions.length,
    EXAM_PACK_LIMITS.questions,
    'questions',
    'domande a scelta multipla',
    add,
  );
  checkCount(
    draft.openQuestions.length,
    EXAM_PACK_LIMITS.openQuestions,
    'openQuestions',
    'domande aperte',
    add,
  );
  checkIds(draft, add);
  const feedQuestions = new Set(context.feedQuestions.map(normalize));
  const seen = new Set<string>();
  draft.questions.forEach((item, i) => {
    checkChoice(item, `questions[${i}]`, context, feedQuestions, add);
    const text = normalize(item.question);
    if (seen.has(text)) add(`questions[${i}].question`, 'Domanda ripetuta');
    seen.add(text);
  });
  draft.openQuestions.forEach((item, i) => {
    checkOpen(item, `openQuestions[${i}]`, context.conceptKeys, 'nel feed della lezione', add);
  });
  return issues;
}

// ---------------------------------------------------------------------------
// Banca degli esercizi della materia (ADR 0014 §2, ADR 0017 scelta 8)
// ---------------------------------------------------------------------------

/**
 * Esercizio della banca d'esame di una materia: una domanda aperta più la sua
 * origine. Gli esercizi **ufficiali** trascrivono il materiale d'esame del
 * corso (es. *Exam Prep*); le **varianti** cambiano dati o richiesta sullo
 * stesso argomento e indicano l'ufficiale da cui nascono.
 */
export interface ExamExercise extends ExamOpenQuestion {
  /** Titolo breve, per l'elenco degli esercizi. */
  readonly title: string;
  readonly origin: 'official' | 'variant';
  /** Id dell'esercizio ufficiale da cui nasce (solo varianti). */
  readonly variantOf?: string | undefined;
  /** Pagina del PDF del materiale d'esame (dell'ufficiale, per le varianti). */
  readonly page: number;
}

/** Banca degli esercizi come la produce Claude. */
export interface ExamBankDraft {
  readonly exercises: readonly ExamExercise[];
}

/** Banca salvata: privata di chi l'ha generata (vedi `subject_exam_banks`). */
export interface ExamBankDocument extends ExamBankDraft {
  readonly subjectId: string;
  readonly promptVersion: string;
  readonly generatedAt: string;
}

/** Quantità della banca: 14 esercizi ufficiali nel corso DSA, 2 varianti ciascuno. */
export const EXAM_BANK_LIMITS = {
  officials: { min: 1, max: 30 },
  variantsPerOfficial: { min: 2, max: 2 },
  exercises: { min: 3, max: 90 },
  page: { min: 1, max: 200 },
} as const;

/**
 * Controlla una banca d'esame: per ogni esercizio le regole delle domande
 * aperte; id unici; ogni variante si riferisce a un ufficiale esistente; ogni
 * ufficiale ha il numero di varianti previsto; concetti della materia.
 *
 * @param draft - Banca già validata nella forma.
 * @param conceptKeys - Concetti dei feed della materia.
 * @returns L'elenco dei problemi; vuoto se la banca è coerente.
 */
export function checkExamBank(draft: ExamBankDraft, conceptKeys: ReadonlySet<string>): FeedIssue[] {
  const issues: FeedIssue[] = [];
  const add: AddIssue = (path, message) => {
    issues.push({ path, message });
  };
  const officials = draft.exercises.filter((item) => item.origin === 'official');
  checkCount(draft.exercises.length, EXAM_BANK_LIMITS.exercises, 'exercises', 'esercizi', add);
  checkCount(officials.length, EXAM_BANK_LIMITS.officials, 'exercises', 'esercizi ufficiali', add);

  const officialIds = new Set(officials.map((item) => item.id));
  const variants = new Map<string, number>();
  const seen = new Set<string>();
  draft.exercises.forEach((item, i) => {
    const path = `exercises[${i}]`;
    if (item.id.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(item.id)) {
      add(`${path}.id`, `"${item.id}" deve essere in kebab-case`);
    }
    if (seen.has(item.id)) add(`${path}.id`, `Id ripetuto: ${item.id}`);
    seen.add(item.id);
    const { min, max } = EXAM_BANK_LIMITS.page;
    if (!Number.isInteger(item.page) || item.page < min || item.page > max) {
      add(`${path}.page`, `Pagina da ${min} a ${max}`);
    }
    if (item.origin === 'official') {
      if (item.variantOf) add(`${path}.variantOf`, 'Un esercizio ufficiale non è una variante');
    } else if (!item.variantOf || !officialIds.has(item.variantOf)) {
      add(`${path}.variantOf`, "Una variante indica l'id di un esercizio ufficiale della banca");
    } else {
      variants.set(item.variantOf, (variants.get(item.variantOf) ?? 0) + 1);
    }
    checkOpen(item, path, conceptKeys, 'nei feed della materia', add);
  });
  draft.exercises.forEach((item, i) => {
    if (item.origin !== 'official') return;
    checkCount(
      variants.get(item.id) ?? 0,
      EXAM_BANK_LIMITS.variantsPerOfficial,
      `exercises[${i}]`,
      'varianti',
      add,
    );
  });
  return issues;
}
