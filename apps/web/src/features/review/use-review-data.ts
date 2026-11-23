'use client';

import type { ConceptReviewState, DayStreak } from '@study-feed/core';
import { EMPTY_DAY_STREAK } from '@study-feed/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadFeed, preferredSubjectId, readCachedFeed } from '../feed/feed-client';
import type { SubjectFeed } from '../feed/model';
import type { ReviewCatalog } from './catalog';
import { buildReviewCatalog } from './catalog';
import { onProgress, progressStore } from './progress-store';

/** Stato dei dati del ripasso. */
export type ReviewData =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly catalog: ReviewCatalog;
      readonly states: readonly ConceptReviewState[];
      readonly streak: DayStreak;
      /** `false` se IndexedDB non è disponibile: si vede il catalogo ma niente si salva. */
      readonly persistent: boolean;
      readonly offline: boolean;
    };

/**
 * Carica ciò che serve al ripasso: la materia (prima la copia sul
 * dispositivo, poi l'eventuale aggiornamento dal server, come il feed) e i
 * progressi in IndexedDB, che si ricaricano a ogni nuova risposta.
 *
 * @returns I dati e una funzione per ricaricare i progressi.
 */
export function useReviewData(): { data: ReviewData; reload: () => void } {
  const [feed, setFeed] = useState<{ feed: SubjectFeed; offline: boolean } | null>(null);
  const [feedStatus, setFeedStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [progress, setProgress] = useState<{
    states: readonly ConceptReviewState[];
    streak: DayStreak;
    persistent: boolean;
  } | null>(null);

  const reload = useCallback(() => {
    void progressStore().then(async (store) => {
      if (!store) {
        setProgress({ states: [], streak: EMPTY_DAY_STREAK, persistent: false });
        return;
      }
      try {
        const [states, streak] = await Promise.all([store.loadReviews(), store.loadDayStreak()]);
        setProgress({ states, streak, persistent: true });
      } catch {
        setProgress({ states: [], streak: EMPTY_DAY_STREAK, persistent: false });
      }
    });
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      const subjectId = preferredSubjectId();
      const cached = subjectId ? readCachedFeed(subjectId) : null;
      if (cached) {
        setFeed({ feed: cached, offline: false });
        setFeedStatus('ready');
      }
    });
    void loadFeed((input, init) => fetch(input, init)).then((result) => {
      if (!alive) return;
      if (result.status === 'unauthorized') {
        window.location.assign('/accedi');
        return;
      }
      if (result.status === 'ready') {
        setFeed((previous) =>
          previous?.feed.version === result.feed.version
            ? { feed: previous.feed, offline: result.offline }
            : { feed: result.feed, offline: result.offline },
        );
        setFeedStatus('ready');
        return;
      }
      // Errore o nessuna materia: si tiene la copia già mostrata, se c'è.
      setFeedStatus((previous) => (previous === 'ready' ? previous : result.status));
      setFeed((previous) => (previous ? { ...previous, offline: true } : previous));
    });
    reload();
    const stop = onProgress(reload);
    return () => {
      alive = false;
      stop();
    };
  }, [reload]);

  const catalog = useMemo(() => (feed ? buildReviewCatalog(feed.feed) : null), [feed]);

  let data: ReviewData;
  if (feedStatus === 'ready' && catalog && progress) {
    data = {
      status: 'ready',
      catalog,
      states: progress.states,
      streak: progress.streak,
      persistent: progress.persistent,
      offline: feed?.offline ?? false,
    };
  } else if (feedStatus === 'empty' || feedStatus === 'error') {
    data = { status: feedStatus };
  } else {
    data = { status: 'loading' };
  }
  return { data, reload };
}
