import type { LessonSourcesResponse } from '@epicfeed/feed';
import type { EpicFeedApi } from '../api-client.js';
import { ApiRequestError } from '../api-client.js';
import { isExamMaterial, matchSlideFiles } from './match.js';
import { pickFigurePages } from './pdf.js';
import type { StoredDeck } from './store.js';
import type { SlidesToolkit } from './toolkit.js';

/** Operazioni dell'API usate dalle slide. */
export type SlidesApi = Pick<EpicFeedApi, 'listCatalog' | 'importSlides'>;

/** Tempo massimo di lavoro di una chiamata a `importa_slide`, poi si riprende. */
export const IMPORT_TIME_BUDGET_MS = 40_000;

/**
 * Per quanto una lezione importata resta "fatta" ai fini della ripresa: le
 * chiamate successive entro questo tempo la saltano, anche con `aggiorna`.
 */
export const RESUME_WINDOW_MS = 10 * 60_000;

/**
 * Avanzamento di `importa_slide` nella sessione di Claude Desktop, per
 * riprendere da dove si era arrivati quando un import supera il tempo di una
 * chiamata. Solo le lezioni riuscite contano come fatte; quelle fallite si
 * riprovano, dopo le altre.
 */
export interface ImportSession {
  /** Lezioni importate (percorso|lezione) e quando. */
  readonly done: Map<string, number>;
  /** Lezioni fallite nella sessione (percorso|lezione). */
  readonly failed: Set<string>;
}

/** Nuova sessione di import, vuota. */
export function newImportSession(): ImportSession {
  return { done: new Map(), failed: new Set() };
}

/** Esito di una chiamata a `importa_slide`, già in parole per Claude. */
export interface ImportSlidesOutcome {
  readonly text: string;
  readonly isError: boolean;
}

/** Opzioni di `importa_slide`. */
export interface ImportSlidesOptions {
  readonly path: string;
  readonly subject?: string | undefined;
  /** Rilegge anche le lezioni che hanno già le slide (zip aggiornato). */
  readonly refresh?: boolean | undefined;
  /** Avanzamento, per Claude Desktop (lezioni fatte su quelle da fare). */
  readonly onProgress?: ((done: number, total: number) => Promise<void>) | undefined;
}

/**
 * `importa_slide`: abbina i PDF dello zip alle lezioni importate, ne estrae il
 * testo sul PC e lo invia a EpicFeed lezione per lezione (ADR 0012).
 *
 * Una chiamata lavora al massimo {@link IMPORT_TIME_BUDGET_MS}: se restano
 * lezioni, lo dice e la chiamata successiva con lo stesso percorso riprende
 * da lì (le lezioni importate negli ultimi {@link RESUME_WINDOW_MS} si
 * saltano; quelle fallite si riprovano per ultime).
 *
 * @param api - API di EpicFeed.
 * @param kit - Operazioni sui file.
 * @param session - Avanzamento nella sessione, per riprendere.
 * @param options - Percorso, materia e opzioni.
 * @returns Il riepilogo per Claude.
 */
export async function importSlides(
  api: SlidesApi,
  kit: SlidesToolkit,
  session: ImportSession,
  options: ImportSlidesOptions,
): Promise<ImportSlidesOutcome> {
  const started = kit.now();
  const allFiles = await kit.listFiles(options.path);
  // Il materiale d'esame non è di una lezione: lo legge leggi_materiale_esame.
  const examFiles = allFiles.filter((file) => isExamMaterial(file.fileName));
  const files = allFiles.filter((file) => !isExamMaterial(file.fileName));
  if (allFiles.length === 0) {
    return { isError: true, text: `In "${options.path}" non ci sono PDF.` };
  }
  const { lessons } = await api.listCatalog();
  const { matched, unmatched } = matchSlideFiles(files, lessons, options.subject);

  const keyOf = (lessonId: string) => `${options.path}|${lessonId}`;
  const recentlyDone = (lessonId: string) =>
    started - (session.done.get(keyOf(lessonId)) ?? -Infinity) < RESUME_WINDOW_MS;
  const todo = [...matched.values()]
    .filter(({ lesson, files: decks }) => {
      if (recentlyDone(lesson.lessonId)) return false;
      const known = lessons.find((l) => l.lessonId === lesson.lessonId)?.slides ?? 0;
      return options.refresh === true || known < decks.length;
    })
    // Le lezioni già fallite in questa sessione si riprovano per ultime.
    .sort(
      (a, b) =>
        Number(session.failed.has(keyOf(a.lesson.lessonId))) -
        Number(session.failed.has(keyOf(b.lesson.lessonId))),
    );

  const indexed = new Map<string, StoredDeck[]>();
  let imported = 0;
  let presentations = 0;
  let changed = 0;
  const failures: string[] = [];
  let attempted = 0;
  for (const [position, { lesson, files: decks }] of todo.entries()) {
    if (kit.now() - started > IMPORT_TIME_BUDGET_MS) break;
    attempted += 1;
    const key = keyOf(lesson.lessonId);
    try {
      const payload = [];
      for (const deck of decks) {
        const pages = await kit.readPages(await deck.file.read());
        payload.push({
          number: deck.number,
          fileName: deck.file.fileName,
          pages: pages.map((page) => ({ number: page.number, text: page.text })),
        });
      }
      const result = await api.importSlides(lesson.lessonId, { presentations: payload });
      imported += 1;
      presentations += result.presentations.length;
      changed += result.presentations.filter((p) => p.newVersion).length;
      indexed.set(
        lesson.lessonId,
        decks.map((deck) => ({
          number: deck.number,
          source: options.path,
          entry: deck.file.entry,
        })),
      );
      // Solo una lezione davvero importata conta come fatta.
      session.done.set(key, kit.now());
      session.failed.delete(key);
    } catch (error) {
      // Un token non valido ferma tutto; gli altri errori riguardano una lezione sola.
      if (error instanceof ApiRequestError && error.code === 'UNAUTHORIZED') throw error;
      const reason = error instanceof Error ? error.message : 'errore inatteso';
      failures.push(`${lesson.lessonTitle}: ${reason}`);
      session.failed.add(key);
    }
    await options.onProgress?.(position + 1, todo.length);
  }
  if (indexed.size > 0) await kit.index.setMany(indexed);

  const remaining = todo.length - attempted;
  const lines = [
    imported === 0 && todo.length === 0
      ? options.refresh === true
        ? `Nessuna lezione da aggiornare: le ${String(matched.size)} lezioni abbinate sono state importate negli ultimi minuti.`
        : `Nessuna lezione da aggiornare: le ${String(matched.size)} lezioni abbinate hanno già le slide. Per rileggerle comunque usa aggiorna: true.`
      : `Slide importate per ${String(imported)} lezioni: ${String(presentations)} presentazioni, di cui ${String(changed)} nuove o cambiate.`,
  ];
  if (changed > 0) {
    lines.push('Le lezioni con slide nuove tornano tra quelle da generare.');
  }
  if (remaining > 0) {
    lines.push(
      `Restano ${String(remaining)} lezioni: chiama di nuovo importa_slide con lo stesso percorso per continuare.`,
    );
  }
  if (failures.length > 0) {
    lines.push('', 'Non importate:', ...failures.map((f) => `- ${f}`));
  }
  if (examFiles.length > 0) {
    lines.push(
      '',
      `Materiale d'esame trovato (${examFiles.map((file) => file.fileName).join(', ')}): per creare la banca degli esercizi chiama leggi_materiale_esame con lo stesso percorso.`,
    );
  }
  if (unmatched.length > 0) {
    lines.push(
      '',
      `PDF non abbinati (${String(unmatched.length)}): se la lezione non è ancora importata, importala con l'estensione e riprova.`,
      ...unmatched.slice(0, 30).map((u) => `- ${u.fileName}: ${u.reason}`),
    );
    if (unmatched.length > 30) lines.push(`… e altri ${String(unmatched.length - 30)}.`);
  }
  return { isError: imported === 0 && failures.length > 0, text: lines.join('\n') };
}

/** Immagine di una pagina di slide da passare a Claude. */
export interface SlideImage {
  readonly label: string;
  readonly png: Buffer;
}

/**
 * Immagini delle pagine con figure delle slide di una lezione, disegnate al
 * momento dai PDF sul PC (ADR 0012). Se i PDF non si trovano più, restituisce
 * una nota invece delle immagini: la generazione continua con il solo testo.
 *
 * @param lesson - Fonti della lezione.
 * @param kit - Operazioni sui file.
 * @returns Immagini e un'eventuale nota.
 */
export async function slideImagesFor(
  lesson: LessonSourcesResponse,
  kit: SlidesToolkit,
): Promise<{ images: SlideImage[]; note: string | null }> {
  const fileNames = new Set(
    lesson.parts.flatMap((part) => (part.content.kind === 'slides' ? [part.content.fileName] : [])),
  );
  if (fileNames.size === 0) return { images: [], note: null };

  const decks = (await kit.index.get(lesson.lessonId)).filter((deck) =>
    fileNames.has(deck.entry.split(/[\\/]/).pop() ?? ''),
  );
  if (decks.length === 0) {
    return {
      images: [],
      note: 'Le immagini delle slide non sono disponibili su questo PC: usa solo il testo. Per averle, importa di nuovo lo zip con importa_slide.',
    };
  }
  try {
    const loaded = await Promise.all(
      decks.map(async (deck) => {
        const data = await kit.readStored(deck);
        return { deck, data, pages: await kit.readPages(data) };
      }),
    );
    const picks = pickFigurePages(loaded.map((l) => ({ number: l.deck.number, pages: l.pages })));
    const images: SlideImage[] = [];
    for (const item of loaded) {
      const pages = picks.filter((p) => p.deck === item.deck.number).map((p) => p.page);
      if (pages.length === 0) continue;
      for (const rendered of await kit.render(item.data, pages)) {
        images.push({
          label: `Slide ${String(item.deck.number)}, pagina ${String(rendered.page)}`,
          png: rendered.png,
        });
      }
    }
    return { images, note: null };
  } catch (error) {
    // Il motivo aiuta a capire se lo zip è sparito o se il disegno non parte.
    const reason = error instanceof Error ? error.message.slice(0, 200) : 'errore inatteso';
    return {
      images: [],
      note: `Non riesco a leggere o disegnare i PDF delle slide (${reason}). Lo zip è stato spostato o cancellato? Usa solo il testo; per avere le immagini, importa di nuovo lo zip con importa_slide.`,
    };
  }
}
