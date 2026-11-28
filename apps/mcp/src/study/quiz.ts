import type { AnswerRecord, ReviewGrade } from '@epicfeed/review';
import {
  conceptId,
  gradeFromAnswer,
  isDue,
  recallProbability,
  replayAnswers,
  summarizeReview,
} from '@epicfeed/review';
import type { StudyConcept } from './concepts.js';
import { subjectConcepts } from './concepts.js';
import type { SubjectFeed } from './library.js';
import { normalize } from './search.js';

/**
 * Quiz al volo in Claude Desktop (M6, ADR 0021, scelta 3): scelta delle
 * domande dai feed e valutazione delle risposte, con le stesse regole del
 * ripasso dell'app. Funzioni pure.
 */

type Bilingual = { readonly it: string; readonly en: string };
type Lesson = SubjectFeed['chapters'][number]['lessons'][number];
type FeedQuiz = NonNullable<Lesson['feed']>['quiz'][number];

/** Domanda del quiz in chat, con la soluzione (la scheda la mostra dopo la risposta). */
export type ChatQuizQuestion = {
  /** Id della domanda nello storico: lo stesso dell'app (`lezione:quiz:id`). */
  readonly questionId: string;
  readonly conceptId: string;
  readonly conceptName: Bilingual;
  readonly lessonTitle: string;
  readonly question: Bilingual;
  readonly explanation: Bilingual;
} & (
  | {
      readonly kind: 'multiple_choice';
      readonly options: { readonly it: readonly string[]; readonly en: readonly string[] };
      readonly correctIndex: number;
    }
  | { readonly kind: 'true_false'; readonly answer: boolean }
);

/** Quiz pronto da mostrare. */
export interface ChatQuiz {
  readonly subjectId: string;
  readonly subjectTitle: string;
  /** Perché queste domande: concetti deboli, scaduti o richiesti. */
  readonly focus: 'weak' | 'requested' | 'mixed';
  readonly questions: readonly ChatQuizQuestion[];
}

/** Filtri del quiz: un concetto o una lezione, per parola. */
export interface QuizRequest {
  readonly topic?: string | undefined;
  readonly count: number;
}

/** Numero massimo di domande in un quiz al volo. */
export const MAX_QUIZ_QUESTIONS = 10;

/** Domande di un concetto, con la lezione. */
function questionsByConcept(feed: SubjectFeed): Map<string, { lesson: Lesson; quiz: FeedQuiz }[]> {
  const byConcept = new Map<string, { lesson: Lesson; quiz: FeedQuiz }[]>();
  for (const chapter of feed.chapters) {
    for (const lesson of chapter.lessons) {
      for (const quiz of lesson.feed?.quiz ?? []) {
        const id = conceptId(feed.subjectId, quiz.conceptKey);
        const list = byConcept.get(id) ?? [];
        list.push({ lesson, quiz });
        byConcept.set(id, list);
      }
    }
  }
  return byConcept;
}

function toQuestion(concept: StudyConcept, lesson: Lesson, quiz: FeedQuiz): ChatQuizQuestion {
  const base = {
    questionId: `${lesson.lessonId}:quiz:${quiz.id}`,
    conceptId: concept.id,
    conceptName: concept.name,
    lessonTitle: lesson.title,
    question: quiz.question,
    explanation: quiz.explanation,
  };
  return quiz.kind === 'multiple_choice'
    ? { ...base, kind: 'multiple_choice', options: quiz.options, correctIndex: quiz.correctIndex }
    : { ...base, kind: 'true_false', answer: quiz.answer };
}

/**
 * Sceglie le domande del quiz. Senza argomento parte dai concetti deboli,
 * poi da quelli da ripassare oggi e da quelli che si ricordano meno, come il
 * Ripasso dell'app; con un argomento tiene i concetti e le lezioni il cui
 * nome lo contiene. Una domanda per concetto a giro, evitando l'ultima già
 * fatta e preferendo quelle risposte meno volte.
 *
 * @param feed - Materia.
 * @param answers - Storico delle risposte (vuoto se i progressi non si leggono).
 * @param request - Argomento e numero di domande.
 * @param now - Adesso.
 * @returns Il quiz, eventualmente vuoto se nessuna domanda corrisponde.
 */
export function pickQuiz(
  feed: SubjectFeed,
  answers: readonly AnswerRecord[],
  request: QuizRequest,
  now: Date,
): ChatQuiz {
  const concepts = subjectConcepts(feed);
  const questions = questionsByConcept(feed);
  const states = replayAnswers(answers.filter((a) => questions.has(a.conceptId)));
  const stateById = new Map(states.map((state) => [state.conceptId, state]));
  const timesAsked = new Map<string, number>();
  for (const answer of answers) {
    if (answer.questionId)
      timesAsked.set(answer.questionId, (timesAsked.get(answer.questionId) ?? 0) + 1);
  }

  const topic = request.topic ? normalize(request.topic) : '';
  const lessonsMatching = (id: string) =>
    (questions.get(id) ?? []).some(({ lesson }) => normalize(lesson.title).includes(topic));
  const candidates = concepts.filter(
    (concept) =>
      questions.has(concept.id) &&
      (topic === '' ||
        normalize(`${concept.name.it} ${concept.name.en} ${concept.key}`).includes(topic) ||
        lessonsMatching(concept.id)),
  );

  const weak = summarizeReview(candidates, states, now, candidates.length).weak.map(
    (s) => s.conceptId,
  );
  const weakSet = new Set(weak);
  const rest = candidates
    .filter((concept) => !weakSet.has(concept.id))
    .map((concept) => {
      const state = stateById.get(concept.id);
      // Mai visti per ultimi; tra i visti prima gli scaduti, poi chi si ricorda meno.
      const rank = !state ? 2 : isDue(state, now) ? -1 : recallProbability(state, now);
      return { id: concept.id, rank };
    })
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.id);
  const order = [...weak, ...rest];
  const byId = new Map(candidates.map((concept) => [concept.id, concept]));

  // Domande di ogni concetto: prima le meno fatte, l'ultima fatta in fondo.
  const queues = new Map(
    order.map((id) => {
      const last = stateById.get(id)?.lastQuestionId ?? null;
      const list = [...(questions.get(id) ?? [])].sort((a, b) => {
        const ka = `${a.lesson.lessonId}:quiz:${a.quiz.id}`;
        const kb = `${b.lesson.lessonId}:quiz:${b.quiz.id}`;
        if ((ka === last) !== (kb === last)) return ka === last ? 1 : -1;
        return (timesAsked.get(ka) ?? 0) - (timesAsked.get(kb) ?? 0);
      });
      return [id, list];
    }),
  );

  const count = Math.min(Math.max(1, request.count), MAX_QUIZ_QUESTIONS);
  const picked: ChatQuizQuestion[] = [];
  while (picked.length < count) {
    let added = false;
    for (const id of order) {
      if (picked.length >= count) break;
      const next = queues.get(id)?.shift();
      const concept = byId.get(id);
      if (!next || !concept) continue;
      picked.push(toQuestion(concept, next.lesson, next.quiz));
      added = true;
    }
    if (!added) break;
  }

  return {
    subjectId: feed.subjectId,
    subjectTitle: feed.title,
    focus: topic !== '' ? 'requested' : weak.length > 0 ? 'weak' : 'mixed',
    questions: picked,
  };
}

/** Risposta data nella scheda del quiz o in chat. */
export interface ChatQuizAnswer {
  readonly conceptId: string;
  readonly questionId: string | null;
  readonly correct: boolean;
  readonly language: 'it' | 'en';
}

/**
 * Le risposte del quiz come voci dello storico: «bene» se giusta, «di
 * nuovo» se sbagliata, come nel feed. I momenti sono distinti (un
 * millisecondo l'uno dall'altro) perché lo storico identifica una risposta
 * anche dal momento.
 *
 * @param answers - Risposte nell'ordine in cui sono state date.
 * @param now - Momento dell'ultima risposta.
 * @returns Le voci da aggiungere allo storico.
 */
export function quizAnswerRecords(answers: readonly ChatQuizAnswer[], now: Date): AnswerRecord[] {
  const start = now.getTime() - answers.length + 1;
  return answers.map((answer, index) => {
    const grade: ReviewGrade = gradeFromAnswer(answer.correct);
    return {
      conceptId: answer.conceptId,
      questionId: answer.questionId,
      source: 'quiz',
      grade,
      language: answer.language,
      at: new Date(start + index).toISOString(),
    };
  });
}
