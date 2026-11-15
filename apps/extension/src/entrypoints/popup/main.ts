import { usableConnection } from '../../lib/connection';
import {
  importStatusSchema,
  readLessonResponse,
  type ImportStatus,
  type LessonPreview,
} from '../../lib/messages';
import { APP_ORIGIN } from '../../lib/origins';
import { parsePortalUrl } from '../../lib/portal';

/**
 * Popup dell'estensione: mostra l'anteprima della lezione aperta e avvia
 * l'import. Tutto il testo che arriva dal portale si inserisce con
 * `textContent`, mai come HTML.
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
      appLink('apri la pagina Estensione', '/estensione'),
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
  renderPreview(tab.id, response.data.preview);
}

function renderPreview(tabId: number, preview: LessonPreview): void {
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
    card.append(el('p', `${preview.skipped} elementi esclusi (slide, quiz…)`, 'mono'));
  }

  const button = el('button', 'Importa la lezione');
  button.addEventListener('click', () => {
    button.disabled = true;
    void browser.runtime
      .sendMessage({ type: 'sf/start-import', tabId, preview })
      .then((reply: unknown) => {
        const result = reply as { ok?: boolean; error?: string } | undefined;
        if (!result?.ok) {
          button.disabled = false;
          app.append(message(result?.error ?? 'Import non avviato.', true));
        }
      });
  });
  show(card, button);
}

function renderStatus(status: ImportStatus): void {
  switch (status.phase) {
    case 'subtitles':
      show(message(`Lettura dei sottotitoli: video ${status.done + 1} di ${status.total}…`));
      break;
    case 'sending':
      show(message('Invio a EpicFeed…'));
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
      card.append(appLink('Apri Le mie lezioni', '/lezioni'));
      show(card);
      break;
    }
    case 'error':
      show(message(status.message, true));
      break;
  }
}

// Lo stato dell'import arriva dal service worker tramite lo storage di sessione.
browser.storage.session.onChanged.addListener((changes) => {
  const status = importStatusSchema.safeParse(changes.importStatus?.newValue);
  if (status.success) renderStatus(status.data);
});

void browser.storage.session.remove('importStatus').then(main);
