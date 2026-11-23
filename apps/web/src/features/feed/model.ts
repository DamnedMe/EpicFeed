import type { SubjectFeedResponse } from '@study-feed/contracts';
import type { SequenceItem } from '@study-feed/core';
import { buildStudySequence } from '@study-feed/core';

/**
 * Modello del feed nella web app: trasforma la materia scaricata
 * (`GET /api/feed/subjects/:id`) negli elementi da scorrere, nell'ordine di
 * `buildStudySequence` (ADR 0015, punto 4). Funzioni pure, provate senza DOM.
 */

export type SubjectFeed = SubjectFeedResponse;
export type FeedLesson = SubjectFeed['chapters'][number]['lessons'][number];
export type LessonFeed = NonNullable<FeedLesson['feed']>;
export type FeedCardData = LessonFeed['cards'][number];
export type FeedQuizData = LessonFeed['quiz'][number];

/** Collegamento a una parte della lezione sul portale. */
export interface PartLink {
  readonly title: string;
  readonly kind: FeedLesson['parts'][number]['kind'];
  readonly portalUrl: string;
}

interface EntryBase {
  /** Chiave stabile dell'elemento: lezione, tipo e id nel feed. */
  readonly key: string;
  readonly chapterIndex: number;
  readonly chapterTitle: string;
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly lessonPortalUrl: string;
}

/** Scheda del feed con le parti a cui rimanda. */
export interface CardEntry extends EntryBase {
  readonly type: 'card';
  readonly card: FeedCardData;
  /** Parte da cui è tratta la scheda. */
  readonly source: PartLink | null;
  /** Parte video del minuto, se la scheda è allineata a un video. */
  readonly video: (PartLink & { readonly startMs: number }) | null;
}

/** Domanda del feed. */
export interface QuizEntry extends EntryBase {
  readonly type: 'quiz';
  readonly quiz: FeedQuizData;
}

export type FeedEntry = CardEntry | QuizEntry;

/**
 * Chiave stabile di una scheda o di una domanda: resta uguale tra un
 * download e l'altro finché la lezione non viene rigenerata.
 *
 * @param lessonId - Lezione.
 * @param type - Scheda o domanda.
 * @param id - Id nel feed della lezione.
 * @returns La chiave.
 */
export function entryKey(lessonId: string, type: SequenceItem['type'], id: string): string {
  return `${lessonId}:${type}:${id}`;
}

/**
 * Elementi del feed di una materia, in ordine.
 *
 * @param feed - Materia scaricata.
 * @returns Schede e domande da scorrere (le lezioni senza feed non compaiono).
 */
export function buildEntries(feed: SubjectFeed): FeedEntry[] {
  const lessons = feed.chapters.flatMap((chapter, chapterIndex) =>
    chapter.lessons.flatMap((lesson) =>
      lesson.feed ? [{ chapter, chapterIndex, lesson, data: lesson.feed }] : [],
    ),
  );
  const byId = new Map(lessons.map((item) => [item.lesson.lessonId, item]));
  const sequence = buildStudySequence(
    lessons.map(({ lesson, data }) => ({
      lessonId: lesson.lessonId,
      cards: data.cards,
      quiz: data.quiz,
    })),
  );

  return sequence.flatMap((item): FeedEntry[] => {
    const found = byId.get(item.lessonId);
    if (!found) return [];
    const { chapter, chapterIndex, lesson, data } = found;
    const parts = new Map(lesson.parts.map((part) => [part.partId, part]));
    const base = {
      chapterIndex,
      chapterTitle: chapter.title,
      lessonId: lesson.lessonId,
      lessonTitle: lesson.title,
      lessonPortalUrl: lesson.portalUrl,
    };
    if (item.type === 'quiz') {
      const quiz = data.quiz[item.index];
      return quiz
        ? [{ ...base, type: 'quiz', key: entryKey(lesson.lessonId, 'quiz', quiz.id), quiz }]
        : [];
    }
    const card = data.cards[item.index];
    if (!card) return [];
    const link = (partId: string | undefined): PartLink | null => {
      const part = partId ? parts.get(partId) : undefined;
      return part ? { title: part.title, kind: part.kind, portalUrl: part.portalUrl } : null;
    };
    // In M2 il tratto non riportava la parte: era sempre quella di provenienza.
    const videoPart = card.video ? link(card.video.partId ?? card.sourcePartId) : null;
    return [
      {
        ...base,
        type: 'card',
        key: entryKey(lesson.lessonId, 'card', card.id),
        card,
        source: link(card.sourcePartId),
        video: card.video && videoPart ? { ...videoPart, startMs: card.video.startMs } : null,
      },
    ];
  });
}

/** Lezione nell'elenco *Capitolo*. */
export interface ChapterLesson {
  readonly lessonId: string;
  readonly title: string;
  /** Indice del primo elemento della lezione nel feed, `null` se non ancora generata. */
  readonly start: number | null;
  readonly cards: number;
}

/** Capitolo nell'elenco *Capitolo*. */
export interface ChapterIndex {
  readonly title: string;
  readonly start: number | null;
  readonly lessons: readonly ChapterLesson[];
}

/**
 * Indice per saltare a un capitolo o a una lezione.
 *
 * @param feed - Materia scaricata.
 * @param entries - Elementi costruiti con {@link buildEntries}.
 * @returns I capitoli in ordine, con le lezioni.
 */
export function chapterIndex(feed: SubjectFeed, entries: readonly FeedEntry[]): ChapterIndex[] {
  const firstByLesson = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (!firstByLesson.has(entry.lessonId)) firstByLesson.set(entry.lessonId, index);
  });
  return feed.chapters.map((chapter) => {
    const lessons = chapter.lessons.map((lesson) => ({
      lessonId: lesson.lessonId,
      title: lesson.title,
      start: firstByLesson.get(lesson.lessonId) ?? null,
      cards: lesson.feed?.cards.length ?? 0,
    }));
    return {
      title: chapter.title,
      start: lessons.find((lesson) => lesson.start !== null)?.start ?? null,
      lessons,
    };
  });
}

/**
 * Posizione da cui riprendere: l'elemento salvato se esiste ancora, altrimenti l'inizio.
 *
 * @param entries - Elementi del feed.
 * @param key - Chiave salvata (o richiesta dall'indirizzo).
 * @returns L'indice.
 */
export function resumeIndex(entries: readonly FeedEntry[], key: string | null): number {
  if (!key) return 0;
  const index = entries.findIndex((entry) => entry.key === key);
  return index < 0 ? 0 : index;
}

/**
 * Minuto del video in forma `m:ss` (o `h:mm:ss`).
 *
 * @param ms - Millisecondi dall'inizio.
 * @returns Il minuto leggibile.
 */
export function formatMinute(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
