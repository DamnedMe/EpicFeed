'use client';

import { useEffect, useRef } from 'react';

/** Mette il fuoco sul pulsante principale quando la schermata compare. */
function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

const GESTURES = [
  { pad: 'tap', title: 'Tocca a destra', text: 'Battuta dopo. A sinistra torni indietro.' },
  { pad: 'swipe', title: 'Scorri in su', text: 'Scheda dopo.' },
  { pad: 'double', title: 'Doppio tocco', text: 'Salvi la scheda.' },
  { pad: 'hold', title: 'Tieni premuto', text: 'Ascolta, lingua, Guarda sul portale, Fonte.' },
] as const;

/**
 * Spiegazione dei gesti al primo avvio (ADR 0015, punto 3): sulla scheda non
 * ci sono pulsanti, quindi i quattro gesti si mostrano con piccole animazioni.
 * Si rivede dal foglio delle azioni o da *Io*.
 */
export function GestureIntro({ onDone }: { onDone: () => void }) {
  const button = useAutoFocus<HTMLButtonElement>();
  return (
    <div className="ef-overlay" role="dialog" aria-modal="true" aria-labelledby="ef-intro-title">
      <h2 id="ef-intro-title">Quattro gesti, nessun pulsante</h2>
      <p>Ogni scheda è una piccola storia: una frase alla volta, tutto lo schermo per leggere.</p>
      <div className="ef-gestures">
        {GESTURES.map((gesture) => (
          <div key={gesture.pad} className="ef-gesture">
            <div className={`ef-pad ${gesture.pad}`} aria-hidden="true">
              <span className="ef-finger" />
            </div>
            <b>{gesture.title}</b>
            <span>{gesture.text}</span>
          </div>
        ))}
      </div>
      <p>
        In alto a destra cambi lingua (IT/EN). Da tastiera: frecce, spazio, S per salvare, A per le
        azioni.
      </p>
      <button ref={button} type="button" className="ef-cta" onClick={onDone}>
        Ho capito, iniziamo
      </button>
    </div>
  );
}

/** Riepilogo della sessione. */
export interface SessionSummary {
  readonly points: number;
  readonly minutes: number;
  readonly cards: number;
  readonly right: number;
  readonly answered: number;
  readonly bestStreak: number;
}

/** Fine della sessione da 5 minuti, con il riepilogo (ADR 0015, punto 2). */
export function SessionEnd({
  summary,
  showPoints,
  onAgain,
  onClose,
}: {
  summary: SessionSummary;
  showPoints: boolean;
  onAgain: () => void;
  onClose: () => void;
}) {
  const button = useAutoFocus<HTMLButtonElement>();
  return (
    <div
      className="ef-overlay ef-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ef-end-title"
    >
      <p className="ef-tag">
        <span className="k">Sessione completata</span>
      </p>
      {showPoints ? (
        <>
          <div className="num">{summary.points}</div>
          <p>punti · {summary.minutes} min</p>
        </>
      ) : (
        <h2 id="ef-end-title">{summary.minutes} minuti di studio</h2>
      )}
      {showPoints ? (
        <h2 id="ef-end-title" className="sr-only">
          Sessione completata
        </h2>
      ) : null}
      <div className="ef-grid3">
        <div>
          <b>{summary.cards}</b>schede
        </div>
        <div>
          <b>
            {summary.right}/{summary.answered}
          </b>
          giuste
        </div>
        <div>
          <b>{summary.bestStreak}</b>serie
        </div>
      </div>
      <button ref={button} type="button" className="ef-cta" onClick={onAgain}>
        Altri 5 minuti
      </button>
      <button type="button" className="ef-link" onClick={onClose}>
        Basta per ora
      </button>
    </div>
  );
}
