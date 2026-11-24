/**
 * Banco di prova del tab *Ripasso* (M4) per Playwright: monta `ReviewApp`
 * con la stessa API del feed simulata del banco del feed, più i contenuti
 * d'esame. I progressi stanno nell'IndexedDB vero del browser di prova.
 */
import { createRoot } from 'react-dom/client';
import { ReviewApp } from '@/features/review/review-app';
import { examFixture, fixture } from './fixture';

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
  if (url.includes('/api/exam/subjects/')) return Promise.resolve(Response.json(examFixture));
  return Promise.resolve(Response.json(url.endsWith('/api/feed/subjects') ? subjects : fixture));
};

const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    // Lo stesso nonce della CSP del banco di prova: lo usa l'editor del codice per i suoi stili.
    <ReviewApp account="0a0a0a0a-0000-4000-8000-00000000000a" nonce="e2e-nonce" />,
  );
