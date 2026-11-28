import type {
  CorrectionDraft,
  ReportErrorRequest,
  StoredCorrection,
  TermUsage,
} from '@epicfeed/feed';
import {
  applyCorrections,
  checkCorrectionDraft,
  correctionDraftSchema,
  countTermUsage,
} from '@epicfeed/feed';
import type { SubjectFeed } from './library.js';

/**
 * *Segnala errore* chiedendolo a Claude (M6, ADR 0021, scelta 4): dalla
 * richiesta dello studente in chat alla correzione di M5, con l'anteprima da
 * mostrare prima di salvare. Funzioni pure sul feed della materia.
 */

type Lesson = SubjectFeed['chapters'][number]['lessons'][number];
type LessonFeed = NonNullable<Lesson['feed']>;

/** Richiesta di correzione come la prepara Claude. */
export type ClaudeReport =
  | {
      readonly kind: 'text';
      readonly lessonId: string;
      readonly itemType: 'card' | 'quiz';
      readonly itemId: string;
      readonly edits: Extract<CorrectionDraft, { kind: 'text' }>['edits'];
      readonly reason: CorrectionDraft['reason'];
    }
  | {
      readonly kind: 'answer';
      readonly lessonId: string;
      readonly itemId: string;
      /** Opzione giusta (scelta multipla) oppure vero/falso. */
      readonly correct: { readonly index: number } | { readonly answer: boolean };
      readonly reason: CorrectionDraft['reason'];
    }
  | {
      readonly kind: 'term';
      readonly from: string;
      readonly to: string;
      readonly reason: CorrectionDraft['reason'];
    };

/** Correzione pronta, con l'anteprima per lo studente. */
export interface PreparedReport {
  /** Correzione già validata, pronta per `POST /api/generation/corrections`. */
  readonly draft: ReportErrorRequest['correction'];
  /** Elemento prima e dopo la correzione (testi e risposta giusta), assente per un termine. */
  readonly before?: unknown;
  readonly after?: unknown;
  readonly lessonTitle?: string;
  /** Dove compare il termine, solo per un termine. */
  readonly usage?: TermUsage;
}

/** Esito della preparazione: la correzione oppure i problemi da sistemare. */
export type PrepareResult =
  | { readonly ok: true; readonly report: PreparedReport }
  | { readonly ok: false; readonly issues: readonly { path: string; message: string }[] };

function lessonOf(feed: SubjectFeed, lessonId: string): Lesson | undefined {
  const id = lessonId.toLowerCase();
  return feed.chapters.flatMap((chapter) => chapter.lessons).find((l) => l.lessonId === id);
}

/** Problemi di forma in parole per Claude. */
function zodIssues(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

const fail = (path: string, message: string): PrepareResult => ({
  ok: false,
  issues: [{ path, message }],
});

/** Elemento come lo vede lo studente, solo i campi che contano per Claude e l'anteprima. */
function visibleItem(feed: LessonFeed, itemType: 'card' | 'quiz', itemId: string): unknown {
  if (itemType === 'card') {
    const card = feed.cards.find((item) => item.id === itemId);
    if (!card) return undefined;
    // Minuti e parte della fonte non servono a chi legge la correzione.
    const visible: Record<string, unknown> = { ...card };
    delete visible.video;
    delete visible.sourcePartId;
    return visible;
  }
  return feed.quiz.find((item) => item.id === itemId);
}

/**
 * Prepara la correzione: la costruisce nella forma di M5, ne controlla le
 * regole e la prova sul feed. Una frase che non c'è nell'elemento indicato
 * non diventa una correzione: Claude deve rileggerla con `cerca_lezione`.
 *
 * @param feed - Materia della correzione.
 * @param report - Richiesta di Claude.
 * @returns La correzione con l'anteprima, oppure i problemi.
 */
export function prepareReport(feed: SubjectFeed, report: ClaudeReport): PrepareResult {
  if (report.kind === 'term') {
    const shape = correctionDraftSchema.safeParse({ ...report });
    if (!shape.success) return { ok: false, issues: zodIssues(shape.error) };
    const draft = shape.data;
    const issues = checkCorrectionDraft(draft);
    if (issues.length > 0) return { ok: false, issues };
    const lessons = feed.chapters
      .flatMap((chapter) => chapter.lessons)
      .flatMap((lesson) => (lesson.feed ? [{ title: lesson.title, feed: lesson.feed }] : []));
    const usage = countTermUsage(lessons, report.from);
    if (usage.items === 0)
      return fail('from', `Il termine «${report.from}» non compare nella materia.`);
    return { ok: true, report: { draft, usage } };
  }

  const lesson = lessonOf(feed, report.lessonId);
  if (!lesson?.feed) return fail('lessonId', 'Lezione non trovata nella materia, o senza feed.');
  const itemType = report.kind === 'answer' ? 'quiz' : report.itemType;
  const snapshot = visibleItem(lesson.feed, itemType, report.itemId);
  if (!snapshot) {
    return fail(
      'itemId',
      'Elemento non trovato nella lezione: cercalo di nuovo con cerca_lezione.',
    );
  }

  let draft: CorrectionDraft;
  if (report.kind === 'text') {
    draft = { ...report, lessonId: lesson.lessonId, snapshot };
  } else {
    const quiz = lesson.feed.quiz.find((item) => item.id === report.itemId);
    if (!quiz) return fail('itemId', 'Domanda non trovata nella lezione.');
    if (quiz.kind === 'multiple_choice') {
      if (!('index' in report.correct)) {
        return fail(
          'correct',
          'È una domanda a scelta multipla: indica index, l’opzione giusta da 0.',
        );
      }
      const { index } = report.correct;
      const it = quiz.options.it[index];
      const en = quiz.options.en[index];
      if (it === undefined || en === undefined)
        return fail('correct.index', 'Opzione inesistente.');
      if (index === quiz.correctIndex) {
        return fail('correct.index', 'È già la risposta giusta indicata dalla domanda.');
      }
      draft = {
        kind: 'answer',
        lessonId: lesson.lessonId,
        itemId: quiz.id,
        fix: { kind: 'multiple_choice', correctIndex: index, option: { it, en } },
        question: { it: quiz.question.it.slice(0, 600), en: quiz.question.en.slice(0, 600) },
        reason: report.reason,
        snapshot,
      };
    } else {
      if (!('answer' in report.correct)) {
        return fail('correct', 'È una domanda vero/falso: indica answer, true o false.');
      }
      if (report.correct.answer === quiz.answer) {
        return fail('correct.answer', 'È già la risposta giusta indicata dalla domanda.');
      }
      draft = {
        kind: 'answer',
        lessonId: lesson.lessonId,
        itemId: quiz.id,
        fix: { kind: 'true_false', answer: report.correct.answer },
        question: { it: quiz.question.it.slice(0, 600), en: quiz.question.en.slice(0, 600) },
        reason: report.reason,
        snapshot,
      };
    }
  }

  const shape = correctionDraftSchema.safeParse(draft);
  if (!shape.success) return { ok: false, issues: zodIssues(shape.error) };
  const issues = checkCorrectionDraft(shape.data);
  if (issues.length > 0) return { ok: false, issues };

  // Prova sul feed com'è adesso: deve cambiare davvero l'elemento.
  const probe: StoredCorrection = {
    id: '00000000-0000-4000-8000-000000000000',
    subjectId: feed.subjectId,
    correction: shape.data,
    claudeStatus: 'not_needed',
    completion: null,
    createdAt: new Date(0).toISOString(),
  };
  const result = applyCorrections(lesson.feed, lesson.lessonId, [probe]);
  const outcome = result.outcomes.get(probe.id);
  if (outcome !== 'applied') {
    return fail(
      'edits',
      outcome === 'already'
        ? 'L’elemento dice già la versione corretta.'
        : 'Il testo da correggere (original) non compare nell’elemento: copialo esattamente da cerca_lezione.',
    );
  }
  return {
    ok: true,
    report: {
      draft: shape.data,
      before: snapshot,
      after: visibleItem(result.feed, itemType, report.itemId),
      lessonTitle: lesson.title,
    },
  };
}
