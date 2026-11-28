import type { SubjectFeed } from './library.js';

/**
 * Ricerca nelle lezioni dello studente (M6, ADR 0021, *Cerca lezione*):
 * funzioni pure sul feed delle materie, così si provano senza rete.
 *
 * La ricerca guarda titoli delle lezioni, schede, domande e concetti nelle
 * due lingue, senza badare a maiuscole e accenti. Ogni parola della domanda
 * pesa per il campo in cui compare (un titolo o un termine del glossario
 * conta più del testo della scheda); un risultato con tutte le parole sale.
 */

type Bilingual = { readonly it: string; readonly en: string };
type Lesson = SubjectFeed['chapters'][number]['lessons'][number];
type Card = NonNullable<Lesson['feed']>['cards'][number];
type Quiz = NonNullable<Lesson['feed']>['quiz'][number];

/** Un elemento trovato: una scheda o una domanda, con dove sta. */
export interface SearchHit {
  readonly subjectId: string;
  readonly subjectTitle: string;
  readonly chapterTitle: string;
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly itemType: 'card' | 'quiz';
  readonly itemId: string;
  /** Posizione della scheda nella lezione (da 1), per «scheda 3». */
  readonly position: number;
  /** Titolo della scheda o testo della domanda. */
  readonly title: Bilingual;
  /** Frase chiave della scheda o spiegazione della domanda. */
  readonly summary: Bilingual;
  /** Testo completo della scheda (per Segnala errore), assente per le domande. */
  readonly body?: Bilingual;
  /** Minuto del video e link alla parte sul portale, se la scheda è allineata. */
  readonly video: {
    readonly minute: string;
    readonly partTitle: string;
    readonly url: string;
  } | null;
  readonly lessonUrl: string;
  readonly score: number;
}

/** Pesi dei campi: titoli e termini indicano l'argomento meglio del testo. */
const WEIGHT = { lesson: 3, title: 4, term: 4, concept: 3, keyPoint: 2, body: 1 } as const;

/**
 * Testo confrontabile: minuscolo, senza accenti, solo lettere e cifre.
 *
 * @param value - Testo.
 * @returns Il testo normalizzato, con le parole separate da uno spazio.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Parole che non aiutano a trovare una lezione. */
const STOP_WORDS = new Set([
  'il',
  'lo',
  'la',
  'i',
  'gli',
  'le',
  'un',
  'una',
  'di',
  'da',
  'in',
  'con',
  'su',
  'per',
  'tra',
  'fra',
  'e',
  'o',
  'che',
  'del',
  'della',
  'dei',
  'delle',
  'nel',
  'nella',
  'come',
  'cosa',
  'dove',
  'si',
  'parla',
  'the',
  'a',
  'an',
  'of',
  'to',
  'and',
  'or',
  'is',
  'what',
  'how',
  'where',
  'on',
]);

/**
 * Parole della domanda da cercare.
 *
 * @param query - Domanda dello studente.
 * @returns Le parole utili, senza doppioni.
 */
export function queryTokens(query: string): string[] {
  const words = normalize(query).split(' ');
  return [...new Set(words.filter((word) => word.length >= 2 && !STOP_WORDS.has(word)))];
}

/** Punteggio di un testo: somma dei pesi delle parole trovate. */
function scoreField(
  tokens: readonly string[],
  found: Set<string>,
  texts: readonly string[],
  weight: number,
): number {
  const haystack = ` ${texts.map(normalize).join(' ')} `;
  let score = 0;
  for (const token of tokens) {
    // Inizio di parola: «avl» trova «avl» e «avl-tree», non «travl».
    if (haystack.includes(` ${token}`)) {
      score += weight;
      found.add(token);
    }
  }
  return score;
}

const both = (value: Bilingual): string[] => [value.it, value.en];

/** Minuto in forma `m:ss`. */
export function formatMinute(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

function videoOf(lesson: Lesson, card: Card): SearchHit['video'] {
  if (!card.video) return null;
  const part = lesson.parts.find((item) => item.partId === card.video?.partId);
  if (!part) return null;
  return { minute: formatMinute(card.video.startMs), partTitle: part.title, url: part.portalUrl };
}

/**
 * Cerca schede e domande nelle materie.
 *
 * @param feeds - Materie scaricate.
 * @param query - Domanda dello studente, in italiano o in inglese.
 * @param limit - Massimo di risultati.
 * @returns I risultati dal più pertinente; vuoto se nessuna parola compare.
 */
export function searchLessons(
  feeds: readonly SubjectFeed[],
  query: string,
  limit = 5,
): SearchHit[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const hits: SearchHit[] = [];

  for (const subject of feeds) {
    for (const chapter of subject.chapters) {
      for (const lesson of chapter.lessons) {
        const feed = lesson.feed;
        if (!feed) continue;
        const conceptNames = new Map(feed.concepts.map((c) => [c.key, both(c.name)]));
        const base = {
          subjectId: subject.subjectId,
          subjectTitle: subject.title,
          chapterTitle: chapter.title,
          lessonId: lesson.lessonId,
          lessonTitle: lesson.title,
          lessonUrl: lesson.portalUrl,
        };

        const rank = (fields: [readonly string[], number][]): number => {
          const found = new Set<string>();
          let score = scoreField(tokens, found, [lesson.title], WEIGHT.lesson);
          for (const [texts, weight] of fields) score += scoreField(tokens, found, texts, weight);
          // Tutte le parole presenti: il risultato è molto più probabile.
          return found.size === tokens.length ? score * 2 : score * (found.size / tokens.length);
        };

        feed.cards.forEach((card, index) => {
          const score = rank([
            [both(card.title), WEIGHT.title],
            [card.terms, WEIGHT.term],
            [card.conceptKeys.flatMap((key) => conceptNames.get(key) ?? []), WEIGHT.concept],
            [both(card.keyPoint), WEIGHT.keyPoint],
            [
              [...both(card.body), ...(card.steps ? [...card.steps.it, ...card.steps.en] : [])],
              WEIGHT.body,
            ],
          ]);
          if (score <= 0) return;
          hits.push({
            ...base,
            itemType: 'card',
            itemId: card.id,
            position: index + 1,
            title: card.title,
            summary: card.keyPoint,
            body: card.body,
            video: videoOf(lesson, card),
            score,
          });
        });

        feed.quiz.forEach((quiz: Quiz, index) => {
          const score = rank([
            [both(quiz.question), WEIGHT.keyPoint],
            [conceptNames.get(quiz.conceptKey) ?? [], WEIGHT.concept],
            [both(quiz.explanation), WEIGHT.body],
          ]);
          if (score <= 0) return;
          hits.push({
            ...base,
            itemType: 'quiz',
            itemId: quiz.id,
            position: index + 1,
            title: quiz.question,
            summary: quiz.explanation,
            video: null,
            // Le domande servono soprattutto a Segnala errore: dopo le schede.
            score: score * 0.8,
          });
        });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
