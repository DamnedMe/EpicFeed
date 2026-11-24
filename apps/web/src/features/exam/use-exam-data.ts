'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ExamContentResponse } from '@epicfeed/contracts';
import type { SubjectFeed } from '../feed/model';
import type { ExamCatalog } from './catalog';
import { buildExamCatalog } from './catalog';
import { loadExamContent, readCachedExam } from './exam-client';

/** Stato dei dati della sezione Esame. */
export type ExamData =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly catalog: ExamCatalog; readonly offline: boolean };

/**
 * Carica i contenuti d'esame della materia: prima la copia sul dispositivo,
 * poi l'eventuale aggiornamento dal server.
 *
 * @param feed - Materia scaricata, oppure `null` finché non c'è.
 * @returns I dati della sezione.
 */
export function useExamData(feed: SubjectFeed | null): ExamData {
  const subjectId = feed?.subjectId ?? null;
  const [loaded, setLoaded] = useState<{
    subjectId: string;
    content: ExamContentResponse | null;
    offline: boolean;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!subjectId) return;
    let alive = true;
    void Promise.resolve().then(() => {
      const cached = readCachedExam(subjectId);
      if (alive && cached) setLoaded({ subjectId, content: cached, offline: false, failed: false });
    });
    void loadExamContent((input, init) => fetch(input, init), subjectId).then((result) => {
      if (!alive) return;
      if (result.status === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setLoaded((previous) =>
        result.status === 'ready'
          ? {
              subjectId,
              // Stessa versione: si tiene l'oggetto già mostrato (niente ricalcolo).
              content:
                previous?.content?.version === result.content.version
                  ? previous.content
                  : result.content,
              offline: result.offline,
              failed: false,
            }
          : { subjectId, content: previous?.content ?? null, offline: true, failed: true },
      );
    });
    return () => {
      alive = false;
    };
  }, [subjectId]);

  const content = loaded?.subjectId === subjectId ? loaded : null;
  const examContent = content?.content ?? null;
  const catalog = useMemo(
    () => (feed && examContent ? buildExamCatalog(feed, examContent) : null),
    [feed, examContent],
  );
  if (catalog && content) return { status: 'ready', catalog, offline: content.offline };
  if (content?.failed) return { status: 'error' };
  return { status: 'loading' };
}
