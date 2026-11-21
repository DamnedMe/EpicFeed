/**
 * Ritmo dell'import di capitoli e corsi.
 *
 * Una lettura alla volta, con pause casuali: niente raffiche e niente
 * intervalli regolari da automatismo. Per confronto, il portale fa circa 15
 * richieste al CMS ogni volta che lo studente apre un contenuto; l'import fa
 * una sola GET per parte utile, più un player Vimeo nascosto per ogni video.
 */

/** Intervallo in millisecondi `[minimo, massimo]`. */
export type Range = readonly [number, number];

/** Pause tra un passo e l'altro dell'import a lotti. */
export interface Pacing {
  /** Prima di leggere il dettaglio di una parte (tranne la prima della lezione). */
  readonly betweenParts: Range;
  /** Prima di caricare il player del video successivo. */
  readonly betweenVideos: Range;
  /** Tra due lezioni dello stesso capitolo. */
  readonly betweenLessons: Range;
  /** Tra l'ultima lezione di un capitolo e la prima del successivo. */
  readonly betweenChapters: Range;
}

/** Ritmo usato per capitoli e corsi. */
export const BATCH_PACING: Pacing = {
  betweenParts: [1500, 4000],
  betweenVideos: [2500, 5500],
  betweenLessons: [6000, 15_000],
  betweenChapters: [20_000, 40_000],
};

/** Tempo medio stimato di un player Vimeo e del download dei sottotitoli. */
const PLAYER_SECONDS = 4;
/** Tempo medio stimato dell'invio di una lezione a EpicFeed. */
const SEND_SECONDS = 1.5;

/**
 * Un valore casuale nell'intervallo.
 *
 * @param range - Minimo e massimo in millisecondi.
 * @param random - Generatore in `[0, 1)` (iniettabile nei test).
 * @returns Millisecondi interi.
 */
export function jitter(range: Range, random: () => number = Math.random): number {
  const [min, max] = range;
  return Math.round(min + (max - min) * random());
}

const average = ([min, max]: Range) => (min + max) / 2000;

/**
 * Stima la durata di un import a lotti con il ritmo indicato.
 *
 * @param lessons - Lezioni da importare, in ordine, con il loro capitolo.
 * @param pacing - Ritmo.
 * @returns Minuti stimati, arrotondati per eccesso (almeno 1).
 */
export function estimateMinutes(
  lessons: readonly { chapterId: string; videos: number; readings: number }[],
  pacing: Pacing = BATCH_PACING,
): number {
  let seconds = 0;
  let previous: string | null = null;
  for (const lesson of lessons) {
    if (previous !== null) {
      seconds += average(
        previous === lesson.chapterId ? pacing.betweenLessons : pacing.betweenChapters,
      );
    }
    previous = lesson.chapterId;
    const parts = lesson.videos + lesson.readings;
    seconds += Math.max(0, parts - 1) * average(pacing.betweenParts);
    seconds += lesson.videos * PLAYER_SECONDS;
    seconds += Math.max(0, lesson.videos - 1) * average(pacing.betweenVideos);
    seconds += SEND_SECONDS;
  }
  return Math.max(1, Math.ceil(seconds / 60));
}
