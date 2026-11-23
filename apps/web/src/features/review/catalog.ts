import type { ReviewConcept, ReviewQuestion, StudyLanguage, TextRange } from '@study-feed/core';
import { conceptId, pickBlank } from '@study-feed/core';
import type { QuizEntry, SubjectFeed } from '../feed/model';
import { entryKey } from '../feed/model';

/**
 * Catalogo del ripasso (M4, ADR 0017): concetti e domande della materia
 * scaricata, nella forma che serve ai casi d'uso del core e alle schermate.
 * Funzioni pure, provate senza DOM.
 */

type Bilingual = { readonly it: string; readonly en: string };

/** Concetto con i testi per la battuta di richiamo. */
export interface CatalogConcept extends ReviewConcept {
  readonly name: Bilingual;
  readonly description: Bilingual;
  readonly chapterTitle: string;
  readonly lessonTitle: string;
  /** Termini del glossario delle schede sul concetto, per la parola da indovinare. */
  readonly terms: readonly string[];
}

/** Catalogo della materia. */
export interface ReviewCatalog {
  readonly subjectId: string;
  readonly concepts: readonly CatalogConcept[];
  readonly conceptsById: ReadonlyMap<string, CatalogConcept>;
  /** Domande per il core: l'id è la chiave dell'elemento del feed (unica nella materia). */
  readonly questions: readonly ReviewQuestion[];
  readonly questionsById: ReadonlyMap<string, QuizEntry>;
  readonly chapterTitles: readonly string[];
}

/**
 * Costruisce il catalogo. Un concetto che compare in più lezioni è uno solo:
 * nome e descrizione vengono dalla prima lezione, i termini da tutte.
 *
 * @param feed - Materia scaricata.
 * @returns Il catalogo.
 */
export function buildReviewCatalog(feed: SubjectFeed): ReviewCatalog {
  const concepts = new Map<string, CatalogConcept & { terms: string[] }>();
  const questions: ReviewQuestion[] = [];
  const questionsById = new Map<string, QuizEntry>();

  feed.chapters.forEach((chapter, chapterIndex) => {
    for (const lesson of chapter.lessons) {
      const data = lesson.feed;
      if (!data) continue;
      for (const concept of data.concepts) {
        const id = conceptId(feed.subjectId, concept.key);
        if (concepts.has(id)) continue;
        concepts.set(id, {
          id,
          key: concept.key,
          chapterIndex,
          chapterTitle: chapter.title,
          lessonTitle: lesson.title,
          name: concept.name,
          description: concept.description,
          terms: [],
        });
      }
      for (const card of data.cards) {
        for (const key of card.conceptKeys) {
          const target = concepts.get(conceptId(feed.subjectId, key));
          if (!target) continue;
          for (const term of card.terms) if (!target.terms.includes(term)) target.terms.push(term);
        }
      }
      for (const quiz of data.quiz) {
        const id = conceptId(feed.subjectId, quiz.conceptKey);
        if (!concepts.has(id)) continue;
        const key = entryKey(lesson.lessonId, 'quiz', quiz.id);
        questions.push({ id: key, conceptId: id });
        questionsById.set(key, {
          type: 'quiz',
          key,
          chapterIndex,
          chapterTitle: chapter.title,
          lessonId: lesson.lessonId,
          lessonTitle: lesson.title,
          lessonPortalUrl: lesson.portalUrl,
          quiz,
        });
      }
    }
  });

  const list = [...concepts.values()];
  return {
    subjectId: feed.subjectId,
    concepts: list,
    conceptsById: new Map(list.map((concept) => [concept.id, concept])),
    questions,
    questionsById,
    chapterTitles: feed.chapters.map((chapter) => chapter.title),
  };
}

/**
 * Parola da indovinare nella descrizione del concetto: un termine del
 * glossario o il nome del concetto, con le stesse regole delle schede.
 *
 * @param concept - Concetto.
 * @param language - Lingua mostrata.
 * @returns Il tratto da coprire, o `null` se non c'è niente di adatto.
 */
export function recallBlank(concept: CatalogConcept, language: StudyLanguage): TextRange | null {
  const text = concept.description[language];
  const fromTerms = pickBlank(text, concept.terms);
  if (fromTerms) return fromTerms;
  const name = concept.name[language];
  const at = text.toLowerCase().indexOf(name.toLowerCase());
  return at >= 0 && name.length >= 3 ? { start: at, end: at + name.length } : null;
}
