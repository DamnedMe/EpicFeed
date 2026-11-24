/**
 * Banco di prova del tab *Ripasso* (M4) per Playwright: monta `ReviewApp`
 * con la stessa API del feed simulata del banco del feed, più i contenuti
 * d'esame. I progressi stanno nell'IndexedDB vero del browser di prova.
 */
import { examFixture, fixture } from './fixture';
import { mount } from './mount';
import { ReviewPage } from './pages';

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

/*
 * Invii per la correzione di Claude: in sessionStorage, così restano dopo un
 * ricaricamento della pagina. `window.efCorrectAll()` fa la parte di Claude
 * Desktop: corregge gli invii in attesa con un suggerimento sulla riga 2.
 */
interface FakeSubmission {
  id: string;
  submission: { subjectId: string; kind: string; items: { key: string; rubric: unknown[] }[] };
  correction: unknown;
  createdAt: string;
}
const readSubmissions = (): FakeSubmission[] =>
  JSON.parse(sessionStorage.getItem('fake-submissions') ?? '[]') as FakeSubmission[];
const writeSubmissions = (list: FakeSubmission[]) => {
  sessionStorage.setItem('fake-submissions', JSON.stringify(list));
};
const toStored = (s: FakeSubmission) => ({
  id: s.id,
  subjectId: s.submission.subjectId,
  kind: s.submission.kind,
  submission: s.submission,
  correction: s.correction,
  createdAt: s.createdAt,
  correctedAt: s.correction ? s.createdAt : null,
});
(window as unknown as { efCorrectAll: () => void }).efCorrectAll = () => {
  writeSubmissions(
    readSubmissions().map((s) => ({
      ...s,
      correction: s.correction ?? {
        summary: 'Solid answer; mind the edge cases.',
        items: s.submission.items.map((item) => ({
          key: item.key,
          scores: item.rubric.map(() => 1),
          comment: 'Slicing copies the list: O(n) extra space.',
          suggestions:
            s.submission.kind === 'exercise'
              ? [
                  {
                    title: 'Reverse in place',
                    explanation: 'list.reverse() avoids the extra copy.',
                    fromLine: 2,
                    toLine: 2,
                    replacement: '    items.reverse()\n    return items',
                  },
                ]
              : [],
        })),
      },
    })),
  );
};

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/api/exam/subjects/')) return Promise.resolve(Response.json(examFixture));
  if (url.includes('/api/exam/submissions')) {
    const method = init?.method ?? 'GET';
    if (method === 'POST') {
      // L'origine del banco non è sicura: niente crypto.randomUUID.
      const id = `50000000-0000-4000-8000-${String(readSubmissions().length + 1).padStart(12, '0')}`;
      const submission = JSON.parse(init?.body as string) as FakeSubmission['submission'];
      writeSubmissions([
        ...readSubmissions(),
        { id, submission, correction: null, createdAt: new Date().toISOString() },
      ]);
      return Promise.resolve(Response.json({ id }, { status: 201 }));
    }
    if (method === 'DELETE') {
      const id = url.split('/').pop();
      writeSubmissions(readSubmissions().filter((s) => s.id !== id));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(Response.json({ submissions: readSubmissions().map(toStored) }));
  }
  return Promise.resolve(Response.json(url.endsWith('/api/feed/subjects') ? subjects : fixture));
};

// Come la pagina del server: la richiesta della password solo senza chiave.
mount(<ReviewPage syncKey={/(^|; )ef-sync-key=1/.test(document.cookie)} />);
