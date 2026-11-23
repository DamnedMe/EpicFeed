/**
 * Banco di prova del feed per Playwright: monta `FeedApp` senza Next.js né
 * Supabase, con l'API del feed simulata. Così i test girano in CI senza
 * credenziali, sulla stessa UI che va in produzione.
 */
import { createRoot } from 'react-dom/client';
import { FeedApp } from '@/features/feed/feed-app';
import { fixture } from './fixture';

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

window.fetch = (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return Promise.resolve(Response.json(url.endsWith('/api/feed/subjects') ? subjects : fixture));
};

const root = document.getElementById('root');
if (root) createRoot(root).render(<FeedApp />);
