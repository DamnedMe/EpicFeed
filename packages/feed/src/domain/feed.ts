import type { ContentHash, Sha256 } from '@epicfeed/catalog';
import { hashCanonical, webCryptoSha256 } from '@epicfeed/catalog';
import { DomainError } from '@epicfeed/shared';
import type { Brand, LessonId, LessonPartId } from '@epicfeed/shared';
import type { VideoAlignment } from './alignment.js';

/**
 * Feed di una lezione: schede, quiz, concetti e voci di glossario generati da
 * Claude Desktop tramite il server MCP (ADR 0007, ADR 0013).
 *
 * Ogni testo destinato allo studente esiste in italiano e in inglese, generato
 * nella stessa passata con la stessa struttura (ADR 0011). Il codice e i nomi
 * tecnici non si traducono, quindi sono campi semplici.
 *
 * Qui stanno le regole che la forma da sola non esprime (riferimenti tra
 * elementi, lunghezze uguali nelle due lingue, quantità): la forma dei campi è
 * validata dagli schemi zod in `contracts/generation.ts`.
 */

/** Lingue di studio (ADR 0011). */
export type StudyLanguage = 'it' | 'en';

/** Le lingue di studio, nell'ordine in cui si controllano. */
export const STUDY_LANGUAGES: readonly StudyLanguage[] = ['it', 'en'];

/** Un valore nelle due lingue di studio. */
export type Bilingual<T = string> = { readonly [L in StudyLanguage]: T };

/**
 * Chiave stabile di un concetto (es. `avl-rotation`). Resta uguale quando la
 * lezione viene rigenerata, così il ripasso FSRS di quel concetto continua.
 */
export type ConceptKey = Brand<string, 'ConceptKey'>;

/** Forma di una chiave di concetto o di un id di elemento: kebab-case ASCII, ≤ 64 caratteri. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Lunghezza massima di una chiave o di un id di elemento. */
export const MAX_SLUG_LENGTH = 64;

/** Tipi di scheda (ADR 0013). */
export type CardKind = 'concept' | 'steps' | 'comparison' | 'code';

/**
 * Provenienza del testo di una scheda (ADR 0006, ADR 0012). Nell'MVP le schede
 * nascono solo da fonti curate: riassunti dei video, testi di lettura, slide.
 */
export type CardOrigin = 'summary' | 'reading' | 'slides';

/** Riga di una scheda di confronto: un aspetto e come lo trattano le due idee. */
export interface ComparisonRow {
  readonly aspect: Bilingual;
  readonly left: Bilingual;
  readonly right: Bilingual;
}

/** Contenuto specifico di una scheda di confronto. */
export interface Comparison {
  readonly left: Bilingual;
  readonly right: Bilingual;
  readonly rows: readonly ComparisonRow[];
}

/** Frammento di codice di una scheda: non si traduce. */
export interface CodeSnippet {
  /** Linguaggio per l'evidenziazione (es. `python`, `java`, `pseudocode`). */
  readonly language: string;
  readonly source: string;
}

/** Scheda del feed: una sola idea, leggibile in 20–40 secondi. */
export interface FeedCard {
  /** Id dell'elemento nel feed (slug, univoco nella lezione). */
  readonly id: string;
  readonly kind: CardKind;
  readonly title: Bilingual;
  /** Frase chiave, ciò che resta se si legge solo quella. */
  readonly keyPoint: Bilingual;
  /** Spiegazione breve. */
  readonly body: Bilingual;
  /** Passi della procedura (solo `steps`, stesso numero nelle due lingue). */
  readonly steps?: Bilingual<readonly string[]> | undefined;
  /** Confronto tra due idee (solo `comparison`). */
  readonly comparison?: Comparison | undefined;
  /** Frammento di codice (obbligatorio per `code`, facoltativo per gli altri tipi). */
  readonly code?: CodeSnippet | undefined;
  /** Termini del glossario citati, nella forma inglese del corso. */
  readonly terms: readonly string[];
  /** Concetti a cui la scheda appartiene (almeno uno). */
  readonly conceptKeys: readonly ConceptKey[];
  /** Parte della lezione da cui la scheda è tratta. */
  readonly sourcePartId: LessonPartId;
  readonly origin: CardOrigin;
}

/** Campi comuni a ogni domanda del quiz. */
interface QuizItemBase {
  readonly id: string;
  readonly question: Bilingual;
  /** Perché la risposta giusta è giusta, mostrata dopo la risposta. */
  readonly explanation: Bilingual;
  /** Concetto verificato dalla domanda: guida il ripasso. */
  readonly conceptKey: ConceptKey;
  /** 1 facile, 2 media, 3 difficile. */
  readonly difficulty: 1 | 2 | 3;
}

/**
 * Domanda a scelta multipla. Le opzioni sono nello stesso ordine nelle due
 * lingue, quindi la risposta corretta è la stessa (ADR 0011).
 */
export interface MultipleChoiceItem extends QuizItemBase {
  readonly kind: 'multiple_choice';
  readonly options: Bilingual<readonly string[]>;
  readonly correctIndex: number;
}

/** Domanda vero/falso. */
export interface TrueFalseItem extends QuizItemBase {
  readonly kind: 'true_false';
  readonly answer: boolean;
}

/** Domanda del quiz. */
export type QuizItem = MultipleChoiceItem | TrueFalseItem;

/** Concetto della lezione: unità del ripasso. */
export interface Concept {
  readonly key: ConceptKey;
  readonly name: Bilingual;
  readonly description: Bilingual;
}

/**
 * Voce del glossario della materia: il termine come lo usa il corso (inglese,
 * quello dell'esame) e la sua resa italiana (ADR 0011).
 */
export interface GlossaryEntry {
  /** Termine nella forma inglese del corso (es. `balance factor`). */
  readonly term: string;
  /** Traduzione italiana (uguale al termine se in italiano non si traduce). */
  readonly translation: string;
  readonly definition: Bilingual;
}

/** Feed di una lezione come lo produce Claude, prima dell'allineamento ai video. */
export interface LessonFeedDraft {
  readonly cards: readonly FeedCard[];
  readonly quiz: readonly QuizItem[];
  readonly concepts: readonly Concept[];
  readonly glossary: readonly GlossaryEntry[];
}

/**
 * Limiti di quantità per lezione. Gli obiettivi del prompt sono più stretti
 * (8–12 schede, 6–8 domande, 3–6 concetti, ADR 0013): questi limiti fermano
 * solo i risultati chiaramente sbagliati, senza rifiutare una lezione corta o
 * molto densa.
 */
export const FEED_LIMITS = {
  cards: { min: 3, max: 20 },
  quiz: { min: 2, max: 12 },
  concepts: { min: 1, max: 10 },
  glossary: { min: 0, max: 40 },
  multipleChoiceOptions: { min: 3, max: 5 },
  steps: { min: 2, max: 8 },
  comparisonRows: { min: 1, max: 6 },
} as const;

/** Problema trovato nel controllo di un feed. */
export interface FeedIssue {
  /** Percorso dell'elemento, es. `cards[3].conceptKeys[0]`. */
  readonly path: string;
  readonly message: string;
}

/** Contesto della lezione necessario per controllare un feed. */
export interface FeedCheckContext {
  /** Parti della lezione a cui le schede possono riferirsi. */
  readonly partIds: ReadonlySet<string>;
}

/**
 * Controlla le regole di un feed che la sola forma non garantisce.
 *
 * Non lancia eccezioni: restituisce tutti i problemi, così il server MCP può
 * mostrarli a Claude in una volta e farli correggere prima di salvare.
 *
 * @param draft - Feed già validato nella forma (schemi zod).
 * @param context - Parti della lezione.
 * @returns L'elenco dei problemi; vuoto se il feed è coerente.
 */
export function checkLessonFeed(draft: LessonFeedDraft, context: FeedCheckContext): FeedIssue[] {
  const issues: FeedIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  checkCount(draft.cards.length, FEED_LIMITS.cards, 'cards', 'schede', add);
  checkCount(draft.quiz.length, FEED_LIMITS.quiz, 'quiz', 'domande', add);
  checkCount(draft.concepts.length, FEED_LIMITS.concepts, 'concepts', 'concetti', add);
  checkCount(draft.glossary.length, FEED_LIMITS.glossary, 'glossary', 'voci di glossario', add);

  const conceptKeys = new Set<string>();
  draft.concepts.forEach((concept, i) => {
    checkSlug(concept.key, `concepts[${i}].key`, add);
    if (conceptKeys.has(concept.key))
      add(`concepts[${i}].key`, `Concetto ripetuto: ${concept.key}`);
    conceptKeys.add(concept.key);
  });

  const usedConcepts = new Set<string>();
  checkUniqueIds(draft.cards, 'cards', add);
  draft.cards.forEach((card, i) => {
    checkCard(card, `cards[${i}]`, conceptKeys, context, add);
    card.conceptKeys.forEach((key) => usedConcepts.add(key));
  });

  checkUniqueIds(draft.quiz, 'quiz', add);
  draft.quiz.forEach((item, i) => {
    checkQuizItem(item, `quiz[${i}]`, conceptKeys, add);
  });

  draft.concepts.forEach((concept, i) => {
    if (!usedConcepts.has(concept.key)) {
      add(`concepts[${i}]`, `Il concetto ${concept.key} non compare in nessuna scheda`);
    }
  });

  const terms = new Set<string>();
  draft.glossary.forEach((entry, i) => {
    const key = glossaryKey(entry.term);
    if (terms.has(key)) add(`glossary[${i}].term`, `Termine ripetuto: ${entry.term}`);
    terms.add(key);
  });

  return issues;
}

/**
 * Chiave di confronto di un termine del glossario: minuscolo, spazi compattati.
 * `Balance  Factor` e `balance factor` sono lo stesso termine.
 *
 * @param term - Termine del glossario.
 * @returns La chiave normalizzata.
 */
export function glossaryKey(term: string): string {
  return term.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
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
    add(path, `Servono da ${limits.min} a ${limits.max} ${label}, ricevute ${count}`);
  }
}

function checkSlug(value: string, path: string, add: AddIssue): void {
  if (value.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(value)) {
    add(path, `"${value}" deve essere in kebab-case (a-z, 0-9, trattini), max ${MAX_SLUG_LENGTH}`);
  }
}

function checkUniqueIds(
  items: readonly { readonly id: string }[],
  path: string,
  add: AddIssue,
): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    checkSlug(item.id, `${path}[${i}].id`, add);
    if (seen.has(item.id)) add(`${path}[${i}].id`, `Id ripetuto: ${item.id}`);
    seen.add(item.id);
  });
}

/**
 * Un testo identico nelle due lingue di solito è una traduzione dimenticata.
 * Vale per i testi lunghi: titoli e opzioni brevi possono coincidere davvero
 * (es. `HashMap`).
 */
function checkTranslated(value: Bilingual, path: string, add: AddIssue): void {
  if (value.it.length > 40 && value.it.trim() === value.en.trim()) {
    add(path, 'Il testo italiano e quello inglese sono identici: manca una traduzione?');
  }
}

function checkSameLength(
  value: Bilingual<readonly unknown[]>,
  limits: { readonly min: number; readonly max: number },
  path: string,
  label: string,
  add: AddIssue,
): void {
  if (value.it.length !== value.en.length) {
    add(
      path,
      `Le due lingue hanno un numero diverso di ${label} (${value.it.length} e ${value.en.length})`,
    );
  }
  checkCount(value.it.length, limits, path, label, add);
}

function checkCard(
  card: FeedCard,
  path: string,
  conceptKeys: ReadonlySet<string>,
  context: FeedCheckContext,
  add: AddIssue,
): void {
  checkTranslated(card.keyPoint, `${path}.keyPoint`, add);
  checkTranslated(card.body, `${path}.body`, add);
  if (!context.partIds.has(card.sourcePartId)) {
    add(`${path}.sourcePartId`, 'La parte indicata non appartiene a questa lezione');
  }
  if (card.conceptKeys.length === 0) add(`${path}.conceptKeys`, 'Serve almeno un concetto');
  card.conceptKeys.forEach((key, i) => {
    if (!conceptKeys.has(key)) add(`${path}.conceptKeys[${i}]`, `Concetto inesistente: ${key}`);
  });

  if (card.kind === 'steps') {
    if (card.steps === undefined) add(`${path}.steps`, 'Una scheda "steps" richiede i passi');
    else checkSameLength(card.steps, FEED_LIMITS.steps, `${path}.steps`, 'passi', add);
  } else if (card.steps !== undefined) {
    add(`${path}.steps`, 'I passi sono ammessi solo nelle schede "steps"');
  }

  if (card.kind === 'comparison') {
    if (card.comparison === undefined) {
      add(`${path}.comparison`, 'Una scheda "comparison" richiede il confronto');
    } else {
      checkCount(
        card.comparison.rows.length,
        FEED_LIMITS.comparisonRows,
        `${path}.comparison.rows`,
        'righe di confronto',
        add,
      );
    }
  } else if (card.comparison !== undefined) {
    add(`${path}.comparison`, 'Il confronto è ammesso solo nelle schede "comparison"');
  }

  if (card.kind === 'code' && card.code === undefined) {
    add(`${path}.code`, 'Una scheda "code" richiede il codice');
  }
}

function checkQuizItem(
  item: QuizItem,
  path: string,
  conceptKeys: ReadonlySet<string>,
  add: AddIssue,
): void {
  checkTranslated(item.question, `${path}.question`, add);
  checkTranslated(item.explanation, `${path}.explanation`, add);
  if (!conceptKeys.has(item.conceptKey)) {
    add(`${path}.conceptKey`, `Concetto inesistente: ${item.conceptKey}`);
  }
  if (item.kind === 'multiple_choice') {
    checkSameLength(
      item.options,
      FEED_LIMITS.multipleChoiceOptions,
      `${path}.options`,
      'opzioni',
      add,
    );
    if (
      !Number.isInteger(item.correctIndex) ||
      item.correctIndex < 0 ||
      item.correctIndex >= item.options.it.length
    ) {
      add(`${path}.correctIndex`, 'La risposta corretta non è tra le opzioni');
    }
    STUDY_LANGUAGES.forEach((language) => {
      const normalized = item.options[language].map((option) => option.trim().toLowerCase());
      if (new Set(normalized).size !== normalized.length) {
        add(`${path}.options.${language}`, 'Due opzioni sono uguali');
      }
    });
  }
}

/** Versione di una parte usata come fonte del feed. */
export interface LessonSource {
  readonly lessonPartId: LessonPartId;
  readonly contentHash: ContentHash;
}

/**
 * Impronta delle fonti di una lezione: identifica l'insieme esatto di versioni
 * da cui è nato un feed. Se Epicode cambia una parte, cambia l'impronta e la
 * lezione torna "da generare"; chi ha ancora la versione vecchia continua a
 * vedere il feed vecchio (ADR 0013).
 *
 * L'ordine delle parti non conta: si ordinano per id prima del calcolo.
 *
 * @param sources - Versioni delle parti della lezione (almeno una).
 * @param sha256 - Implementazione del digest; di default la Web Crypto API.
 * @returns L'impronta esadecimale.
 */
export async function computeLessonSourcesHash(
  sources: readonly LessonSource[],
  sha256: Sha256 = webCryptoSha256,
): Promise<ContentHash> {
  const canonical = sources
    .map((source) => ({ part: source.lessonPartId, hash: source.contentHash }))
    .sort((a, b) => (a.part < b.part ? -1 : a.part > b.part ? 1 : a.hash < b.hash ? -1 : 1));
  return hashCanonical(canonical, sha256);
}

/** Scheda salvata: la scheda generata più il tratto di video (`null` se incerto). */
export interface StoredFeedCard extends FeedCard {
  readonly video: VideoAlignment | null;
}

/**
 * Documento salvato per una lezione e letto dalla web app (M3). Il glossario
 * non ne fa parte: va nel glossario della materia, condiviso tra le lezioni.
 */
export interface LessonFeedDocument {
  readonly lessonId: LessonId;
  readonly sourcesHash: ContentHash;
  readonly promptVersion: string;
  /** Istante di generazione in formato ISO 8601. */
  readonly generatedAt: string;
  readonly cards: readonly StoredFeedCard[];
  readonly quiz: readonly QuizItem[];
  readonly concepts: readonly Concept[];
  /**
   * Versione delle regole con cui sono stati calcolati i tratti di video
   * (`ALIGNMENT_VERSION`). Manca nei feed salvati in M2, che valgono come versione 1.
   */
  readonly alignmentVersion?: number;
}

/**
 * Feed rifiutato dalle regole di {@link checkLessonFeed}: porta l'elenco
 * completo dei problemi, da mostrare a Claude perché li corregga.
 */
export class FeedValidationError extends DomainError {
  /**
   * @param issues - Problemi trovati (almeno uno).
   * @param subject - Cosa è stato rifiutato, per il messaggio (feed o pacchetto d'esame).
   */
  constructor(
    readonly issues: readonly FeedIssue[],
    subject = 'Il feed',
  ) {
    super('INVALID_FEED', `${subject} ha ${issues.length} problemi da correggere`);
    this.name = 'FeedValidationError';
  }
}
