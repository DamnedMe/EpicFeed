import { usableConnection } from '../../lib/connection';
import { IMPORTED_KEY, readImported, type ImportedLessons } from '../../lib/imported';
import {
  importStatusSchema,
  readLessonResponse,
  type BatchPlan,
  type BatchProgress,
  type ImportStatus,
  type LessonPreview,
  type OutlineSummary,
} from '../../lib/messages';
import { APP_ORIGIN } from '../../lib/origins';
import { estimateMinutes } from '../../lib/pacing';
import { parsePortalUrl } from '../../lib/portal';

/**
 * Popup dell'estensione: mostra l'anteprima della lezione aperta e avvia
 * l'import della lezione, del suo capitolo o dell'intero corso; durante un
 * import mostra l'avanzamento e permette di interromperlo. Tutto il testo che
 * arriva dal portale si inserisce con `textContent`, mai come HTML.
 */
const app = document.getElementById('app') as HTMLElement;
const badge = document.getElementById('connection') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function show(...nodes: Node[]): void {
  app.replaceChildren(...nodes);
}

function message(text: string, error = false): HTMLElement {
  return el('p', text, `card ${error ? 'error' : 'muted'}`);
}

function appLink(text: string, path: string): HTMLAnchorElement {
  const link = el('a', text);
  link.href = new URL(path, APP_ORIGIN).toString();
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

async function main(): Promise<void> {
  const stored = await browser.storage.local.get('connection');
  const connection = usableConnection(stored.connection);
  badge.textContent = connection ? 'collegata' : 'non collegata';
  if (!connection) {
    const card = el('div', undefined, 'card');
    card.append(
      el('p', 'Collega l’estensione al tuo account EpicFeed: '),
      appLink('apri la pagina Estensione', '/extension'),
    );
    show(card);
    return;
  }

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !parsePortalUrl(tab.url)) {
    show(message('Apri una lezione sul portale Epicode, poi premi di nuovo l’icona.'));
    return;
  }

  show(message('Lettura della lezione…'));
  const response = readLessonResponse.safeParse(
    await browser.tabs.sendMessage(tab.id, { type: 'sf/read-lesson' }).catch(() => null),
  );
  if (!response.success) {
    show(message('Ricarica la pagina del portale e riprova.', true));
    return;
  }
  if (!response.data.ok) {
    show(message(response.data.error, true));
    return;
  }
  const memory = await browser.storage.local.get(IMPORTED_KEY);
  renderLesson(
    tab.id,
    response.data.preview,
    response.data.outline,
    readImported(memory[IMPORTED_KEY]),
  );
}

/** Anteprima della lezione aperta e pulsanti di import. */
function renderLesson(
  tabId: number,
  preview: LessonPreview | null,
  outline: OutlineSummary | null,
  imported: ImportedLessons,
): void {
  const nodes: Node[] = [];
  if (preview) {
    nodes.push(previewCard(preview));
    const button = el('button', 'Importa la lezione');
    button.addEventListener('click', () => {
      start(button, { type: 'sf/start-import', tabId, preview });
    });
    nodes.push(button);
  } else {
    nodes.push(message('Questa lezione non ha riassunti da importare (quiz o slide).'));
  }

  if (outline) {
    nodes.push(batchCard(tabId, outline, imported));
  } else {
    nodes.push(
      el(
        'p',
        'Per importare il capitolo o il corso intero ricarica la pagina del portale.',
        'mono note',
      ),
    );
  }
  show(...nodes);
}

/** Invia il comando di avvio al service worker e gestisce il rifiuto. */
function start(button: HTMLButtonElement, command: object): void {
  button.disabled = true;
  void browser.runtime.sendMessage(command).then((reply: unknown) => {
    const result = reply as { ok?: boolean; error?: string } | undefined;
    if (!result?.ok) {
      button.disabled = false;
      app.append(message(result?.error ?? 'Import non avviato.', true));
    }
  });
}

/**
 * Pulsanti per capitolo e corso, con numero di lezioni e durata stimata.
 * Le lezioni senza video né testi non si propongono; quelle già importate da
 * questo browser si saltano, a meno di chiedere di reimportarle.
 */
function batchCard(tabId: number, outline: OutlineSummary, imported: ImportedLessons): HTMLElement {
  const card = el('div', undefined, 'card');
  card.append(el('span', 'Import a ritmo prudente', 'mono'));
  const actions = el('div', undefined, 'actions');
  const toggle = el('label', undefined, 'toggle');
  const checkbox = el('input');
  checkbox.type = 'checkbox';
  toggle.append(checkbox, document.createTextNode(' Reimporta anche quelle già importate'));

  const lessonsOf = (chapters: OutlineSummary['chapters'], includeImported: boolean) =>
    chapters.flatMap((chapter) =>
      chapter.lessons
        .filter((lesson) => lesson.videos + lesson.readings > 0)
        .filter((lesson) => includeImported || !(lesson.id in imported))
        .map((lesson) => ({ ...lesson, chapterId: chapter.id })),
    );
  const chapter = outline.chapters.find((item) => item.id === outline.chapterId) ?? null;
  const alreadyImported = lessonsOf(outline.chapters, true).filter(
    (lesson) => lesson.id in imported,
  ).length;

  const render = () => {
    const includeImported = checkbox.checked;
    const scopes: {
      scope: BatchPlan['scope'];
      title: string;
      label: string;
      chapters: OutlineSummary['chapters'];
    }[] = [];
    if (chapter) {
      scopes.push({
        scope: 'chapter',
        title: chapter.title,
        label: 'Importa il capitolo',
        chapters: [chapter],
      });
    }
    scopes.push({
      scope: 'course',
      title: outline.courseTitle,
      label: 'Importa tutto il corso',
      chapters: outline.chapters,
    });
    actions.replaceChildren();
    for (const item of scopes) {
      const lessons = lessonsOf(item.chapters, includeImported);
      const button = el('button', item.label, 'secondary');
      const detail =
        lessons.length === 0
          ? 'già tutto importato'
          : `${String(lessons.length)} ${lessons.length === 1 ? 'lezione' : 'lezioni'} · circa ${String(estimateMinutes(lessons))} min`;
      button.append(
        el('span', item.scope === 'chapter' ? `${item.title} · ${detail}` : detail, 'sub'),
      );
      button.disabled = lessons.length === 0;
      button.addEventListener('click', () => {
        const plan: BatchPlan = {
          scope: item.scope,
          title: item.title,
          courseId: outline.courseId,
          lessons: lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            chapterId: lesson.chapterId,
          })),
        };
        start(button, { type: 'sf/start-batch-import', tabId, plan });
      });
      actions.append(button);
    }
  };
  checkbox.addEventListener('change', render);
  render();
  card.append(actions);
  if (alreadyImported > 0) card.append(toggle);
  card.append(
    el(
      'p',
      'Una lezione alla volta, con pause casuali. Tieni aperta la scheda del portale: puoi chiudere questo riquadro.',
      'mono note',
    ),
  );
  return card;
}

function previewCard(preview: LessonPreview): HTMLElement {
  const { path, parts } = preview.request;
  const card = el('div', undefined, 'card');
  card.append(
    el('span', `${path.subject.title} · ${path.chapter.title}`, 'mono'),
    el('h1', path.lesson.title),
  );
  const list = el('ul');
  for (const part of parts) {
    const kind = part.kind === 'video' ? 'video' : 'riassunto';
    const summary =
      part.content.kind === 'video' && Object.keys(part.content.summaries).length === 0
        ? ' · senza riassunto'
        : '';
    list.append(el('li', `${part.title} (${kind}${summary})`));
  }
  card.append(list);
  if (preview.skipped > 0) {
    card.append(el('p', `${String(preview.skipped)} elementi esclusi (slide, quiz…)`, 'mono'));
  }
  return card;
}

/** Ultimo stato mostrato: serve al conto alla rovescia delle pause. */
let lastStatus: ImportStatus | null = null;

/** Avanzamento di un import a lotti, con il pulsante per interromperlo. */
function progressView(progress: BatchProgress, step: string): Node[] {
  const card = el('div', undefined, 'card');
  card.append(
    el(
      'span',
      `${progress.scope === 'chapter' ? 'Capitolo' : 'Corso'} · ${progress.title}`,
      'mono',
    ),
    el('h1', `Lezione ${String(progress.index + 1)} di ${String(progress.total)}`),
    el('p', progress.lessonTitle, 'muted'),
  );
  const bar = el('div', undefined, 'bar');
  const fill = el('div');
  fill.style.width = `${String(Math.round((progress.index / progress.total) * 100))}%`;
  bar.append(fill);
  card.append(bar, el('p', step, 'mono'));

  const stop = el('button', 'Interrompi', 'secondary');
  stop.addEventListener('click', () => {
    stop.disabled = true;
    stop.textContent = 'Interruzione…';
    void browser.runtime.sendMessage({ type: 'sf/stop-import' });
  });
  return [
    card,
    stop,
    el('p', 'Puoi chiudere questo riquadro: tieni aperta la scheda del portale.', 'mono note'),
  ];
}

function renderStatus(status: ImportStatus): void {
  lastStatus = status;
  switch (status.phase) {
    case 'reading':
      show(...progressView(status.progress, 'Lettura dal portale…'));
      break;
    case 'pause': {
      const seconds = Math.max(0, Math.ceil((status.until - Date.now()) / 1000));
      const step =
        status.reason === 'rate-limit'
          ? `Limite orario di EpicFeed: riprendo alle ${new Date(status.until).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`
          : `Pausa prudente: riprendo tra ${String(seconds)} s.`;
      show(...progressView(status.progress, step));
      break;
    }
    case 'subtitles': {
      const step = `Sottotitoli: video ${String(status.done + 1)} di ${String(status.total)}…`;
      show(...(status.progress ? progressView(status.progress, step) : [message(step)]));
      break;
    }
    case 'sending':
      show(
        ...(status.progress
          ? progressView(status.progress, 'Invio a EpicFeed…')
          : [message('Invio a EpicFeed…')]),
      );
      break;
    case 'batch-done':
      show(batchSummary(status));
      break;
    case 'done': {
      const fresh = status.result.parts.filter((part) => part.newEntitlement).length;
      const card = el('div', undefined, 'card');
      card.append(
        el('h1', `Importata: ${status.lessonTitle}`),
        el(
          'p',
          fresh > 0
            ? `${String(status.result.parts.length)} parti, ${String(fresh)} nuove per te.`
            : 'Era già tutto importato: nessun duplicato.',
          'muted',
        ),
      );
      if (status.missingSubtitles > 0) {
        card.append(
          el('p', `Sottotitoli non trovati per ${String(status.missingSubtitles)} video.`, 'mono'),
        );
      }
      card.append(appLink('Apri Le mie lezioni', '/lessons'));
      show(card);
      break;
    }
    case 'error':
      show(message(status.message, true));
      break;
  }
}

/** Riepilogo di un import di capitolo o corso. */
function batchSummary(status: Extract<ImportStatus, { phase: 'batch-done' }>): HTMLElement {
  const card = el('div', undefined, 'card');
  const what = status.scope === 'chapter' ? 'Capitolo' : 'Corso';
  card.append(
    el('span', status.title, 'mono'),
    el('h1', status.stopped ? 'Import interrotto' : `${what} importato`),
    el(
      'p',
      `${String(status.imported)} di ${String(status.total)} lezioni importate, ${String(status.freshLessons)} nuove per te.`,
      'muted',
    ),
  );
  if (status.stopped) card.append(el('p', status.stopped, 'error'));
  if (status.empty > 0) {
    card.append(el('p', `${String(status.empty)} senza riassunti da importare.`, 'mono'));
  }
  if (status.missingSubtitles > 0) {
    card.append(
      el('p', `Sottotitoli non trovati per ${String(status.missingSubtitles)} video.`, 'mono'),
    );
  }
  if (status.failed.length > 0) {
    const list = el('ul');
    for (const failure of status.failed.slice(0, 10)) {
      list.append(el('li', `${failure.title}: ${failure.message}`));
    }
    card.append(el('p', 'Non importate:', 'mono'), list);
  }
  if (status.stopped || status.failed.length > 0) {
    card.append(
      el('p', 'Riavviando lo stesso import, le lezioni già importate si saltano.', 'mono note'),
    );
  }
  card.append(appLink('Apri Le mie lezioni', '/lessons'));
  return card;
}

// Lo stato dell'import arriva dal service worker tramite lo storage di sessione.
browser.storage.session.onChanged.addListener((changes) => {
  const status = importStatusSchema.safeParse(changes.importStatus?.newValue);
  if (status.success) renderStatus(status.data);
});

// Conto alla rovescia delle pause.
setInterval(() => {
  if (lastStatus?.phase === 'pause') renderStatus(lastStatus);
}, 1000);

/**
 * All'apertura: se un import è in corso ne mostra l'avanzamento, altrimenti
 * legge la lezione aperta.
 */
async function open(): Promise<void> {
  const stored = await browser.storage.local.get('connection');
  badge.textContent = usableConnection(stored.connection) ? 'collegata' : 'non collegata';
  const state = (await browser.runtime
    .sendMessage({ type: 'sf/import-state' })
    .catch(() => null)) as { running?: boolean } | null;
  if (state?.running) {
    const stored = await browser.storage.session.get('importStatus');
    const status = importStatusSchema.safeParse(stored.importStatus);
    if (status.success) renderStatus(status.data);
    else show(message('Import in corso…'));
    return;
  }
  await browser.storage.session.remove('importStatus');
  await main();
}

void open();
