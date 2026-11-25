/**
 * Banco di prova del feed per Playwright: monta `FeedApp` senza Next.js né
 * Supabase, con l'API del feed simulata. Così i test girano in CI senza
 * credenziali, sulla stessa UI che va in produzione.
 */
import type { StoredCorrection } from '@epicfeed/feed';
import { initialClaudeStatus } from '@epicfeed/feed';
import { fixture } from './fixture';
import { mount, readPreview } from './mount';
import { FeedPage } from './pages';

const subjects = {
  subjects: [
    {
      subjectId: fixture.subjectId,
      title: fixture.title,
      editionLabel: '2024/25',
      lessons: 2,
      lessonsWithFeed: 1,
    },
  ],
};

/**
 * Rete simulata, scelta con `?rete=` nell'indirizzo: `lenta` non risponde mai
 * (il feed deve partire dalla copia sul dispositivo), `assente` fallisce
 * subito come senza connessione.
 */
const network = new URLSearchParams(window.location.search).get('rete');
/** Correzioni di *Segnala errore* salvate dal server simulato. */
const corrections = new Map<string, StoredCorrection>();

/** API delle correzioni simulata: elenco, nuova correzione, annullamento. */
function correctionsApi(url: string, init?: RequestInit): Response {
  const method = init?.method ?? 'GET';
  if (method === 'DELETE') {
    corrections.delete(url.split('/').pop() ?? '');
    return new Response(null, { status: 204 });
  }
  if (method === 'POST' && typeof init?.body === 'string') {
    const body = JSON.parse(init.body) as Pick<StoredCorrection, 'id' | 'subjectId' | 'correction'>;
    const correction: StoredCorrection = {
      ...body,
      claudeStatus: initialClaudeStatus(body.correction),
      completion: null,
      createdAt: new Date().toISOString(),
    };
    corrections.set(body.id, correction);
    return Response.json({ correction }, { status: 201 });
  }
  return Response.json({ corrections: [...corrections.values()] });
}

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (network === 'lenta') return new Promise<Response>(() => {});
  if (network === 'assente') return Promise.reject(new TypeError('Failed to fetch'));
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url, window.location.href).pathname.startsWith('/api/corrections')) {
    return Promise.resolve(correctionsApi(url, init));
  }
  return Promise.resolve(Response.json(url.endsWith('/api/feed/subjects') ? subjects : fixture));
};

mount(<FeedPage preview={readPreview()} />);
