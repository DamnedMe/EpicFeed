/**
 * Banco di prova del feed per Playwright: monta `FeedApp` senza Next.js né
 * Supabase, con l'API del feed simulata. Così i test girano in CI senza
 * credenziali, sulla stessa UI che va in produzione.
 */
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
window.fetch = (input: RequestInfo | URL) => {
  if (network === 'lenta') return new Promise<Response>(() => {});
  if (network === 'assente') return Promise.reject(new TypeError('Failed to fetch'));
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return Promise.resolve(Response.json(url.endsWith('/api/feed/subjects') ? subjects : fixture));
};

mount(<FeedPage preview={readPreview()} />);
