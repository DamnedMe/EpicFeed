import type { Bilingual, FeedCard, StudyLanguage } from './feed.js';
import type { LessonPartId } from './ids.js';
import type { SubtitleCue, SubtitleTrack } from './subtitles.js';

/**
 * Allineamento di una scheda al tratto di video in cui se ne parla, per aprire
 * "Guarda sul portale" al minuto giusto (ADR 0006).
 *
 * È codice deterministico, non una richiesta a Claude (piano di sviluppo, M2):
 * stesso input, stesso risultato, testabile e istantaneo. Confronta le parole
 * significative della scheda con finestre di sottotitoli di circa 30 secondi,
 * pesando di più le parole rare nella traccia (una variante di TF-IDF) e i
 * termini del glossario. Regge ai sottotitoli imprecisi perché guarda il
 * contenuto, non la frase esatta. Se il risultato è incerto restituisce `null`
 * e la scheda apre la parte video dall'inizio, mai a un minuto sbagliato.
 */

/** Tratto di video trovato per una scheda. */
export interface VideoAlignment {
  readonly startMs: number;
  readonly endMs: number;
  /** Quota pesata delle parole della scheda trovate nel tratto, da 0 a 1. */
  readonly confidence: number;
  /** Lingua della traccia usata. */
  readonly language: string;
  /**
   * Parte video del tratto. Da M3 c'è sempre; nei feed allineati prima
   * (versione 1) manca e vale la parte di provenienza della scheda.
   */
  readonly partId?: LessonPartId;
}

/**
 * Versione delle regole di allineamento. Sale quando cambiano le regole o i
 * parametri: i feed salvati con una versione più vecchia si riallineano
 * (`RealignLessonFeeds`), senza rigenerare nulla in Claude Desktop.
 *
 * - 1 (M2): solo le schede tratte da una parte video, sui sottotitoli di quella parte.
 * - 2 (M3, ADR 0015): anche le schede tratte da slide e letture, cercando nei
 *   video della stessa lezione.
 */
export const ALIGNMENT_VERSION = 2;

/** Parametri dell'allineamento, con valori predefiniti tarati sul corso DSA. */
export interface AlignmentOptions {
  /** Durata di una finestra di sottotitoli. */
  readonly windowMs: number;
  /** Anticipo rispetto all'inizio della finestra, per non entrare a frase iniziata. */
  readonly leadMs: number;
  /** Confidenza minima per accettare un tratto. */
  readonly minConfidence: number;
  /** Parole distinte minime in comune con il tratto. */
  readonly minMatchedTokens: number;
  /** Di quanto il tratto migliore deve superare il migliore tra quelli lontani. */
  readonly minMargin: number;
  /** Peso dei termini del glossario rispetto alle altre parole. */
  readonly termWeight: number;
}

/** Valori predefiniti dell'allineamento. */
export const DEFAULT_ALIGNMENT_OPTIONS: AlignmentOptions = {
  windowMs: 30_000,
  leadMs: 1_500,
  minConfidence: 0.3,
  minMatchedTokens: 3,
  minMargin: 1.2,
  termWeight: 2,
};

/** Testo di ricerca: le parole della scheda e i termini tecnici. */
export interface AlignmentQuery {
  readonly texts: readonly string[];
  readonly terms: readonly string[];
}

// Parole frequenti in italiano e inglese che non dicono nulla dell'argomento.
const STOPWORDS = new Set(
  stripAccents(
    'the and for are but not you all any can had her was one our out has have him his how its may new now ' +
      'see two way who did get let put say she too use that this with from they will would there their what ' +
      'about which when make like time just know take into year your some could them than then look only come ' +
      'over also back after first well even want because these give most each where does here very more ' +
      'such being other should while used using called example ' +
      'che per con non una uno del della delle dei degli nel nella nei sono come anche più questo questa ' +
      'questi queste quello quella quindi dove quando perché poi alla alle allo agli dal dalla dai sulla sul ' +
      'essere viene vengono ogni tutti tutto molto cosa fare stato stata può possono abbiamo avere ha hanno ' +
      'esempio cioè ovvero mentre così solo ancora sempre già tra fra',
  ).split(' '),
);

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Riduce un testo alle sue parole significative, in forma confrontabile:
 * minuscolo, senza accenti, solo lettere e cifre, senza parole frequenti,
 * senza la `s` finale e troncate a 5 caratteri: una radice grezza ma
 * sufficiente perché singolare e plurale (`tree`/`trees`, `albero`/`alberi`)
 * o parole della stessa famiglia (`insert`/`insertion`) contino come una.
 *
 * @param text - Testo libero (anche markdown o codice).
 * @returns Le parole significative, con ripetizioni.
 */
export function tokenize(text: string): string[] {
  return stripAccents(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
    .map((token) => token.slice(0, 5));
}

interface Window {
  readonly startMs: number;
  readonly endMs: number;
  readonly tokens: ReadonlySet<string>;
}

/**
 * Trova il tratto di una traccia di sottotitoli che meglio corrisponde a un testo.
 *
 * @param query - Parole della scheda e termini del glossario.
 * @param cues - Righe della traccia, ordinate per tempo (forma canonica).
 * @param options - Parametri; di default {@link DEFAULT_ALIGNMENT_OPTIONS}.
 * @returns Il tratto, senza la lingua, oppure `null` se l'abbinamento è incerto.
 */
export function alignToCues(
  query: AlignmentQuery,
  cues: readonly SubtitleCue[],
  options: AlignmentOptions = DEFAULT_ALIGNMENT_OPTIONS,
): Omit<VideoAlignment, 'language'> | null {
  if (cues.length === 0) return null;

  const cueTokens = cues.map((cue) => new Set(tokenize(cue.text)));
  // Frequenza documentale per riga: una parola che compare ovunque pesa poco.
  const documentFrequency = new Map<string, number>();
  for (const tokens of cueTokens) {
    for (const token of tokens)
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }

  const weights = queryWeights(query, options.termWeight);
  const idf = (token: string): number => {
    const df = documentFrequency.get(token);
    return df === undefined ? 0 : Math.log(1 + cues.length / df);
  };
  // Il denominatore considera solo le parole presenti nella traccia: una
  // scheda lunga con parole mai pronunciate non deve abbassare ogni tratto.
  let total = 0;
  for (const [token, weight] of weights) total += weight * idf(token);
  if (total === 0) return null;

  const windows = buildWindows(cues, cueTokens, options.windowMs);
  const scored = windows.map((window) => {
    let score = 0;
    let matched = 0;
    for (const [token, weight] of weights) {
      if (window.tokens.has(token)) {
        score += weight * idf(token);
        matched += 1;
      }
    }
    return { window, confidence: score / total, matched };
  });

  let best = scored[0];
  for (const candidate of scored) {
    if (best === undefined || candidate.confidence > best.confidence) best = candidate;
  }
  if (best === undefined) return null;
  const bestWindow = best.window;

  // Il migliore tra i tratti che non si sovrappongono al vincitore: se è quasi
  // altrettanto buono, l'argomento torna in più punti e il minuto è incerto.
  let runnerUp = 0;
  for (const candidate of scored) {
    const overlaps =
      candidate.window.startMs < bestWindow.endMs && candidate.window.endMs > bestWindow.startMs;
    if (!overlaps) runnerUp = Math.max(runnerUp, candidate.confidence);
  }

  if (
    best.confidence < options.minConfidence ||
    best.matched < options.minMatchedTokens ||
    (runnerUp > 0 && best.confidence < runnerUp * options.minMargin)
  ) {
    return null;
  }

  return {
    startMs: Math.max(0, bestWindow.startMs - options.leadMs),
    endMs: bestWindow.endMs,
    confidence: Math.round(best.confidence * 1000) / 1000,
  };
}

function queryWeights(query: AlignmentQuery, termWeight: number): Map<string, number> {
  const weights = new Map<string, number>();
  for (const text of query.texts) {
    for (const token of tokenize(text)) weights.set(token, Math.max(weights.get(token) ?? 0, 1));
  }
  for (const term of query.terms) {
    for (const token of tokenize(term)) weights.set(token, termWeight);
  }
  return weights;
}

/** Una finestra parte da ogni riga e include le righe che iniziano entro `windowMs`. */
function buildWindows(
  cues: readonly SubtitleCue[],
  cueTokens: readonly ReadonlySet<string>[],
  windowMs: number,
): Window[] {
  const windows: Window[] = [];
  let end = 0;
  const current = new Map<string, number>();
  for (let start = 0; start < cues.length; start += 1) {
    const startCue = cues[start] as SubtitleCue;
    while (end < cues.length && (cues[end] as SubtitleCue).startMs - startCue.startMs < windowMs) {
      for (const token of cueTokens[end] as ReadonlySet<string>)
        current.set(token, (current.get(token) ?? 0) + 1);
      end += 1;
    }
    const lastCue = cues[end - 1] as SubtitleCue;
    windows.push({
      startMs: startCue.startMs,
      endMs: lastCue.endMs,
      tokens: new Set(current.keys()),
    });
    // La riga di partenza esce dalla finestra successiva.
    for (const token of cueTokens[start] as ReadonlySet<string>) {
      const count = (current.get(token) ?? 0) - 1;
      if (count <= 0) current.delete(token);
      else current.set(token, count);
    }
  }
  return windows;
}

/**
 * Testo di ricerca di una scheda in una lingua: titolo, frase chiave,
 * spiegazione, passi e confronto, più i termini del glossario.
 *
 * @param card - Scheda del feed.
 * @param language - Lingua dei testi da usare.
 * @returns Il testo di ricerca.
 */
export function cardQuery(card: FeedCard, language: StudyLanguage): AlignmentQuery {
  const pick = (value: Bilingual): string => value[language];
  const texts = [pick(card.title), pick(card.keyPoint), pick(card.body)];
  if (card.steps !== undefined) texts.push(...card.steps[language]);
  if (card.comparison !== undefined) {
    texts.push(pick(card.comparison.left), pick(card.comparison.right));
    for (const row of card.comparison.rows)
      texts.push(pick(row.aspect), pick(row.left), pick(row.right));
  }
  return { texts, terms: card.terms };
}

/**
 * Allinea una scheda alle tracce della sua parte video, provando ogni traccia
 * con il testo della scheda nella stessa lingua (italiano con la traccia
 * italiana, inglese con quella inglese) e tenendo il risultato più sicuro. A
 * parità preferisce le tracce non generate automaticamente.
 *
 * @param card - Scheda del feed.
 * @param tracks - Tracce di sottotitoli della parte da cui la scheda è tratta.
 * @param options - Parametri; di default {@link DEFAULT_ALIGNMENT_OPTIONS}.
 * @returns Il tratto di video, oppure `null` se nessuna traccia dà un risultato sicuro.
 */
export function alignCard(
  card: FeedCard,
  tracks: readonly SubtitleTrack[],
  options: AlignmentOptions = DEFAULT_ALIGNMENT_OPTIONS,
): VideoAlignment | null {
  let best: { alignment: VideoAlignment; auto: boolean } | null = null;
  for (const track of tracks) {
    const language = studyLanguageOf(track.language);
    if (language === null) continue;
    const result = alignToCues(cardQuery(card, language), track.cues, options);
    if (result === null) continue;
    const better =
      best === null ||
      result.confidence > best.alignment.confidence ||
      (result.confidence === best.alignment.confidence && best.auto && !track.autoGenerated);
    if (better)
      best = { alignment: { ...result, language: track.language }, auto: track.autoGenerated };
  }
  return best?.alignment ?? null;
}

/**
 * Lingua di studio di una traccia (`it`, `en-x-autogen` → `en`).
 *
 * @param language - Lingua della traccia in formato BCP 47 semplificato.
 * @returns La lingua di studio, oppure `null` per le altre lingue.
 */
export function studyLanguageOf(language: string): StudyLanguage | null {
  const primary = language.toLowerCase().split('-')[0];
  return primary === 'it' || primary === 'en' ? primary : null;
}

/** Parte video di una lezione con le sue tracce di sottotitoli. */
export interface VideoPartTracks {
  readonly partId: LessonPartId;
  readonly tracks: readonly SubtitleTrack[];
}

/**
 * Allinea una scheda ai video della sua lezione (ADR 0015).
 *
 * - Scheda tratta da una parte video: si cerca solo in quella parte, come in M2;
 *   se lì il risultato è incerto, la scheda resta senza minuto (il riassunto di
 *   un video parla di quel video, cercarla altrove darebbe falsi positivi).
 * - Scheda tratta da slide o lettura: si cerca in ogni video della lezione e si
 *   tiene il tratto più sicuro; a parità vince il video che viene prima. Le
 *   soglie sono le stesse, quindi un tratto incerto non viene mai proposto.
 *
 * @param card - Scheda del feed.
 * @param videoParts - Parti video della lezione, in ordine, con le loro tracce.
 * @param options - Parametri; di default {@link DEFAULT_ALIGNMENT_OPTIONS}.
 * @returns Il tratto con la parte video, oppure `null`.
 */
export function alignCardToLesson(
  card: FeedCard,
  videoParts: readonly VideoPartTracks[],
  options: AlignmentOptions = DEFAULT_ALIGNMENT_OPTIONS,
): VideoAlignment | null {
  const own = videoParts.find((part) => part.partId === card.sourcePartId);
  const candidates = own ? [own] : videoParts;
  let best: VideoAlignment | null = null;
  for (const part of candidates) {
    if (part.tracks.length === 0) continue;
    const result = alignCard(card, part.tracks, options);
    if (result !== null && (best === null || result.confidence > best.confidence)) {
      best = { ...result, partId: part.partId };
    }
  }
  return best;
}
