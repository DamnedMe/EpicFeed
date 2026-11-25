import type {
  ExamContentResponse,
  CodeTest,
  OpenQuestionKind,
  RubricCriterion,
} from '@epicfeed/exam';
import type { SubjectFeed } from '../feed/model';
import { entryKey } from '../feed/model';

/**
 * Catalogo della sezione Esame (M4, ADR 0014 e 0017): domande dei quiz di
 * modulo ed esercizi aperti di una materia, tutto in inglese. Unisce il feed
 * della materia (domande già viste) con i contenuti d'esame (pacchetti delle
 * lezioni e banca dello studente). Funzioni pure, provate senza DOM.
 */

/** Domanda a scelta multipla del quiz di modulo, già in inglese. */
export interface ExamQuizQuestion {
  /** Chiave stabile, unica nella materia. */
  readonly key: string;
  readonly conceptKey: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correctIndex: number;
  readonly explanation: string;
  /** Dal feed (già vista studiando) o dal pacchetto d'esame (nuova). */
  readonly source: 'feed' | 'exam';
}

/** Modulo (capitolo) con le sue domande. */
export interface ExamModule {
  readonly chapterIndex: number;
  readonly title: string;
  readonly questions: readonly ExamQuizQuestion[];
}

/** Esercizio aperto: dalla banca (ufficiale o variante) o da una lezione. */
export interface ExamExerciseItem {
  /** Chiave stabile, unica nella materia (per bozze e ripasso). */
  readonly key: string;
  readonly title: string;
  readonly group: 'official' | 'variant' | 'lesson';
  /** Da dove viene: pagina del materiale o lezione. */
  readonly context: string;
  readonly kind: OpenQuestionKind;
  readonly prompt: string;
  readonly code: string | null;
  readonly signature: string | null;
  readonly tests: readonly CodeTest[];
  readonly hints: readonly { readonly it: string; readonly en: string }[];
  readonly modelAnswer: string;
  readonly rubric: readonly RubricCriterion[];
  readonly conceptKeys: readonly string[];
  readonly followUp: string;
}

/** Catalogo della sezione Esame per una materia. */
export interface ExamCatalog {
  readonly subjectId: string;
  readonly modules: readonly ExamModule[];
  readonly exercises: readonly ExamExerciseItem[];
  readonly exercisesByKey: ReadonlyMap<string, ExamExerciseItem>;
  /** `true` se c'è la banca degli esercizi dello studente. */
  readonly hasBank: boolean;
  /** Lezioni con il pacchetto d'esame sul totale di quelle con un feed. */
  readonly packs: { readonly ready: number; readonly lessons: number };
}

/** Titolo breve di un esercizio delle lezioni: la prima frase della consegna. */
function shortTitle(prompt: string): string {
  const first = prompt.split(/(?<=[.?!])\s/)[0] ?? prompt;
  return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
}

const KIND_ORDER: Record<ExamExerciseItem['group'], number> = {
  official: 0,
  variant: 1,
  lesson: 2,
};

/**
 * Costruisce il catalogo. Le domande dei moduli sono quelle del feed (in
 * inglese, il vero/falso come due opzioni) più quelle dei pacchetti; gli
 * esercizi della banca vengono prima, ogni ufficiale seguito dalle sue varianti.
 *
 * @param feed - Materia scaricata.
 * @param content - Contenuti d'esame della stessa materia.
 * @returns Il catalogo.
 */
export function buildExamCatalog(feed: SubjectFeed, content: ExamContentResponse): ExamCatalog {
  const packs = new Map(content.packs.map((pack) => [pack.lessonId, pack]));
  const modules: ExamModule[] = [];
  const lessonExercises: ExamExerciseItem[] = [];
  let lessonsWithFeed = 0;

  feed.chapters.forEach((chapter, chapterIndex) => {
    const questions: ExamQuizQuestion[] = [];
    for (const lesson of chapter.lessons) {
      if (!lesson.feed) continue;
      lessonsWithFeed += 1;
      for (const quiz of lesson.feed.quiz) {
        const key = entryKey(lesson.lessonId, 'quiz', quiz.id);
        questions.push(
          quiz.kind === 'multiple_choice'
            ? {
                key,
                conceptKey: quiz.conceptKey,
                question: quiz.question.en,
                options: quiz.options.en,
                correctIndex: quiz.correctIndex,
                explanation: quiz.explanation.en,
                source: 'feed',
              }
            : {
                key,
                conceptKey: quiz.conceptKey,
                question: quiz.question.en,
                options: ['True', 'False'],
                correctIndex: quiz.answer ? 0 : 1,
                explanation: quiz.explanation.en,
                source: 'feed',
              },
        );
      }
      // Solo il pacchetto del feed che si sta studiando: uno vecchio non arriva dal server.
      const pack = packs.get(lesson.lessonId);
      if (!pack) continue;
      for (const item of pack.questions) {
        questions.push({
          key: `${lesson.lessonId}:exam:${item.id}`,
          conceptKey: item.conceptKey,
          question: item.question,
          options: item.options,
          correctIndex: item.correctIndex,
          explanation: item.explanation,
          source: 'exam',
        });
      }
      for (const open of pack.openQuestions) {
        lessonExercises.push({
          key: `${lesson.lessonId}:open:${open.id}`,
          title: shortTitle(open.prompt),
          group: 'lesson',
          context: lesson.title,
          kind: open.kind,
          prompt: open.prompt,
          code: open.code ?? null,
          signature: open.signature ?? null,
          tests: open.tests ?? [],
          hints: open.hints,
          modelAnswer: open.modelAnswer,
          rubric: open.rubric,
          conceptKeys: open.conceptKeys,
          followUp: open.followUp,
        });
      }
    }
    if (questions.length > 0) modules.push({ chapterIndex, title: chapter.title, questions });
  });

  const bankExercises: ExamExerciseItem[] = (content.bank?.exercises ?? []).map((exercise) => ({
    key: `bank:${exercise.id}`,
    title: exercise.title,
    group: exercise.origin,
    context: `Exam Prep, p. ${exercise.page}`,
    kind: exercise.kind,
    prompt: exercise.prompt,
    code: exercise.code ?? null,
    signature: exercise.signature ?? null,
    tests: exercise.tests ?? [],
    hints: exercise.hints,
    modelAnswer: exercise.modelAnswer,
    rubric: exercise.rubric,
    conceptKeys: exercise.conceptKeys,
    followUp: exercise.followUp,
  }));
  // Ogni ufficiale seguito dalle sue varianti, in ordine di pagina.
  const officialOrder = new Map(
    (content.bank?.exercises ?? [])
      .filter((exercise) => exercise.origin === 'official')
      .sort((a, b) => a.page - b.page)
      .map((exercise, index) => [exercise.id, index]),
  );
  const parentOf = new Map(
    (content.bank?.exercises ?? []).map((exercise) => [
      `bank:${exercise.id}`,
      exercise.variantOf ?? exercise.id,
    ]),
  );
  bankExercises.sort((a, b) => {
    const pa = officialOrder.get(parentOf.get(a.key) ?? '') ?? Number.MAX_SAFE_INTEGER;
    const pb = officialOrder.get(parentOf.get(b.key) ?? '') ?? Number.MAX_SAFE_INTEGER;
    return pa - pb || KIND_ORDER[a.group] - KIND_ORDER[b.group];
  });

  const exercises = [...bankExercises, ...lessonExercises];
  return {
    subjectId: feed.subjectId,
    modules,
    exercises,
    exercisesByKey: new Map(exercises.map((exercise) => [exercise.key, exercise])),
    hasBank: content.bank !== null,
    packs: {
      ready: feed.chapters
        .flatMap((chapter) => chapter.lessons)
        .filter((lesson) => lesson.feed && packs.has(lesson.lessonId)).length,
      lessons: lessonsWithFeed,
    },
  };
}
