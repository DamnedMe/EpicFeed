'use client';

import type { PlannedReview } from '@study-feed/core';
import {
  completeReviewSession,
  currentDayStreak,
  localDay,
  planReviewSession,
  summarizeReview,
  systemClock,
} from '@study-feed/core';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav } from '@/components/bottom-nav';
import { Icon } from '../feed/icons';
import { syncNow, useProgressSync } from '../sync/engine';
import { SyncPanel } from '../sync/sync-panel';
import { preferences, useLocalValue } from '../feed/local-state';
import type { ReviewCatalog } from './catalog';
import { notifyProgress, progressStore } from './progress-store';
import type { ReviewOutcome } from './review-session';
import { ReviewSession } from './review-session';
import type { ReviewData } from './use-review-data';
import { useReviewData } from './use-review-data';
import { ExamSection } from '../exam/exam-section';

type Section = 'review' | 'exam';

/** Sezione scelta dall'indirizzo (`#esame`), così si può tornare all'Esame con un link. */
function sectionFromHash(): Section {
  return window.location.hash === '#esame' ? 'exam' : 'review';
}

/**
 * Tab *Ripasso* (M4, ADR 0017): in alto le due sezioni Ripasso ed Esame
 * (la barra in basso non cambia).
 * I progressi si sincronizzano cifrati tra i dispositivi (ADR 0018).
 *
 * @param props.account - Utente della sessione.
 * @param props.nonce - Nonce della CSP (per l'editor del codice nella sezione Esame).
 * @param props.syncKey - `false` se il dispositivo non ha la chiave della
 *   sincronizzazione (dal cookie): la richiesta della password è già nella pagina.
 */
export function ReviewApp({
  account,
  nonce = null,
  syncKey = true,
}: {
  account: string;
  nonce?: string | null;
  syncKey?: boolean;
}) {
  useProgressSync(account);
  const { data } = useReviewData();
  const [section, setSection] = useState<Section>('review');
  const [plan, setPlan] = useState<readonly PlannedReview[] | null>(null);
  const [outcome, setOutcome] = useState<(ReviewOutcome & { streak: number }) | null>(null);

  useEffect(() => {
    const sync = () => {
      setSection(sectionFromHash());
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const choose = (next: Section) => {
    setSection(next);
    window.history.replaceState(null, '', next === 'exam' ? '#esame' : window.location.pathname);
  };

  if (plan && data.status === 'ready') {
    return (
      <ReviewSession
        catalog={data.catalog}
        plan={plan}
        onExit={() => {
          setPlan(null);
        }}
        onFinish={(result) => {
          void progressStore().then(async (store) => {
            let streak = 0;
            if (store) {
              try {
                streak = (await completeReviewSession(store, systemClock)).days;
              } catch {
                // Serie non salvata: il ripasso è comunque registrato.
              }
            }
            setOutcome({ ...result, streak });
            setPlan(null);
            notifyProgress();
            // Fine sessione: i progressi partono subito per gli altri dispositivi.
            void syncNow(account);
          });
        }}
      />
    );
  }

  return (
    <div className="ef-page">
      <header className="ef-rv-head">
        <h1 className="font-display text-3xl font-bold tracking-tight">Ripasso</h1>
        {data.status === 'ready' && data.offline ? <span className="ef-hint">offline</span> : null}
      </header>
      <div className="ef-seg ef-rv-tabs" role="tablist" aria-label="Sezioni del ripasso">
        <button
          type="button"
          role="tab"
          aria-selected={section === 'review'}
          aria-pressed={section === 'review'}
          onClick={() => {
            choose('review');
          }}
        >
          Ripasso
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'exam'}
          aria-pressed={section === 'exam'}
          onClick={() => {
            choose('exam');
          }}
        >
          Esame
        </button>
      </div>
      {/* Senza chiave la richiesta della password sta in cima: è già nella pagina
          del server e il ripasso che arriva dopo non la sposta. */}
      {section === 'review' && !syncKey ? (
        <SyncPanel account={account} keyExpected={false} />
      ) : null}
      {outcome ? (
        <ReviewEnd
          outcome={outcome}
          onClose={() => {
            setOutcome(null);
          }}
        />
      ) : null}
      {section === 'review' ? (
        <ReviewHome
          data={data}
          onStart={(next) => {
            setOutcome(null);
            setPlan(next);
          }}
        />
      ) : (
        <ExamSection
          feed={data.status === 'ready' ? data.feed : null}
          reviewCatalog={data.status === 'ready' ? data.catalog : null}
          nonce={nonce}
        />
      )}
      {section === 'review' && syncKey ? <SyncPanel account={account} /> : null}
      <BottomNav active="review" />
    </div>
  );
}

/** Home del ripasso: scadenze di oggi, serie, concetti deboli e moduli. */
function ReviewHome({
  data,
  onStart,
}: {
  data: ReviewData;
  onStart: (plan: readonly PlannedReview[]) => void;
}) {
  const prefs = useLocalValue(preferences);
  const now = useMemo(() => new Date(), []);
  const ready = data.status === 'ready' ? data : null;
  const summary = useMemo(
    () => (ready ? summarizeReview(ready.catalog.concepts, ready.states, now) : null),
    [ready, now],
  );
  const plan = useMemo(
    () =>
      ready
        ? planReviewSession(ready.catalog.concepts, ready.catalog.questions, ready.states, now)
        : [],
    [ready, now],
  );

  if (data.status === 'loading') {
    return <p className="ef-rv-note">Carico i tuoi progressi…</p>;
  }
  if (data.status !== 'ready' || !summary) {
    return (
      <section className="ef-panel ef-rv-box">
        <p>
          {data.status === 'empty'
            ? 'Nessuna materia pronta da ripassare: importa e genera una lezione, poi studiala nel feed.'
            : 'Non riesco a caricare la materia. Riprova quando c’è la connessione.'}
        </p>
      </section>
    );
  }

  const streak = currentDayStreak(data.streak, localDay(now));
  const seen = summary.chapters.reduce((total, chapter) => total + chapter.seen, 0);
  const early = plan.length > 0 && plan[0]?.reason === 'early';

  return (
    <>
      <section className="ef-panel ef-rv-box" aria-labelledby="rv-today">
        <div className="ef-rv-today">
          <div>
            <div className="ef-rv-num">{summary.due}</div>
            <h2 id="rv-today" className="ef-rv-label">
              {summary.due === 1 ? 'concetto da ripassare oggi' : 'concetti da ripassare oggi'}
            </h2>
          </div>
          <span className={`ef-stat ${streak >= 2 ? 'hot' : ''}`} title="Giorni di ripasso di fila">
            <Icon name="flame" />
            {streak} {streak === 1 ? 'giorno' : 'giorni'}
          </span>
        </div>
        {plan.length > 0 ? (
          <>
            <p className="ef-rv-note">
              {early
                ? 'Oggi non scade niente: puoi ripassare in anticipo ciò che ricordi meno.'
                : `Circa ${Math.max(1, Math.round(plan.length / 2))} minuti, ${plan.length} concetti.`}
            </p>
            <button
              type="button"
              className="ef-cta"
              onClick={() => {
                onStart(plan);
              }}
            >
              {early ? 'Ripassa in anticipo' : 'Inizia il ripasso'}
            </button>
          </>
        ) : (
          <p className="ef-rv-note">
            {seen === 0
              ? 'Rispondi alle domande del feed: ogni concetto che incontri arriva qui, e quelli che sbagli tornano prima.'
              : 'Hai ripassato tutto. Torna domani.'}
          </p>
        )}
        {!data.persistent ? (
          <p className="ef-rv-note">
            Questo browser non permette di salvare i progressi (navigazione privata?): il ripasso
            non verrà ricordato.
          </p>
        ) : null}
        {seen === 0 ? (
          <Link href="/" className="ef-link">
            Vai al feed
          </Link>
        ) : null}
      </section>

      {summary.weak.length > 0 ? (
        <section className="ef-section" aria-labelledby="rv-weak">
          <h2 id="rv-weak">Concetti deboli</h2>
          <ul className="ef-panel ef-rv-list">
            {summary.weak.map((state) => {
              const concept = data.catalog.conceptsById.get(state.conceptId);
              if (!concept) return null;
              return (
                <li key={state.conceptId}>
                  <span>{concept.name[prefs.language]}</span>
                  <span className="ef-hint">
                    {state.wrong} {state.wrong === 1 ? 'errore' : 'errori'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="ef-section" aria-labelledby="rv-modules">
        <h2 id="rv-modules">Per modulo</h2>
        <ModuleBars catalog={data.catalog} chapters={summary.chapters} />
        <p className="ef-rv-note">
          Pieno: concetti stabili, che ricordi da almeno una settimana. Chiaro: visti almeno una
          volta.
        </p>
      </section>
    </>
  );
}

/** Barre dei moduli: concetti stabili e visti sul totale. */
function ModuleBars({
  catalog,
  chapters,
}: {
  catalog: ReviewCatalog;
  chapters: ReturnType<typeof summarizeReview>['chapters'];
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // Larghezze impostate dal client: la CSP non permette `style` nel markup del server.
  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLElement>('[data-stable]').forEach((bar) => {
      bar.style.setProperty('--ef-stable', bar.dataset.stable ?? '0');
      bar.style.setProperty('--ef-seen', bar.dataset.seen ?? '0');
    });
  }, [chapters]);
  return (
    <ul ref={listRef} className="ef-panel ef-rv-modules">
      {chapters.map((chapter) => (
        <li key={chapter.chapterIndex}>
          <span>{catalog.chapterTitles[chapter.chapterIndex]}</span>
          <span className="ef-hint">
            {chapter.stable}/{chapter.concepts}
          </span>
          <div
            className="ef-rv-bar"
            role="img"
            aria-label={`${chapter.stable} stabili e ${chapter.seen} visti su ${chapter.concepts}`}
            data-stable={chapter.concepts ? chapter.stable / chapter.concepts : 0}
            data-seen={chapter.concepts ? chapter.seen / chapter.concepts : 0}
          >
            <i className="seen" />
            <i className="stable" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Riepilogo dopo una sessione completata. */
function ReviewEnd({
  outcome,
  onClose,
}: {
  outcome: ReviewOutcome & { streak: number };
  onClose: () => void;
}) {
  const prefs = useLocalValue(preferences);
  return (
    <section className="ef-panel ef-rv-box ef-rv-end" aria-labelledby="rv-end" role="status">
      <p className="ef-tag">
        <span className="k">Ripasso completato</span>
      </p>
      <h2 id="rv-end" className="ef-rv-label">
        {outcome.streak > 1
          ? `Serie di ${outcome.streak} giorni di fila`
          : 'Primo giorno della serie'}
      </h2>
      <div className="ef-grid3">
        <div>
          <b>{outcome.concepts}</b>concetti
        </div>
        <div>
          <b>
            {outcome.right}/{outcome.concepts}
          </b>
          giuste
        </div>
        <div>
          <b>{prefs.points ? outcome.points : outcome.bestStreak}</b>
          {prefs.points ? 'punti' : 'serie'}
        </div>
      </div>
      <button type="button" className="ef-link" onClick={onClose}>
        Chiudi
      </button>
    </section>
  );
}
