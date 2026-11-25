'use client';

import { EXERCISE_TIMER_MINUTES } from '@epicfeed/exam';
import { useEffect, useState } from 'react';

/** Minuti e secondi, con il segno meno oltre il tempo. */
function clock(seconds: number): string {
  const sign = seconds < 0 ? '−' : '';
  const value = Math.abs(seconds);
  return `${sign}${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/**
 * Timer facoltativo dell'esercizio (ADR 0014 §3): si sceglie la durata, a
 * fine tempo avvisa e si può continuare (il tempo in più si vede in negativo).
 */
export function ExerciseTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const tick = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, [endsAt]);

  if (endsAt === null) {
    return (
      <div className="ef-seg ef-ex-timer" role="group" aria-label="Timer facoltativo">
        <span className="ef-hint">Timer</span>
        {EXERCISE_TIMER_MINUTES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => {
              const start = Date.now();
              setNow(start);
              setEndsAt(start + minutes * 60_000);
            }}
          >
            {minutes} min
          </button>
        ))}
      </div>
    );
  }

  const left = Math.round((endsAt - now) / 1000);
  return (
    <div className="ef-ex-timer on" role="timer" aria-live="off">
      <span className={`ef-stat ${left <= 0 ? 'hot' : ''}`}>{clock(left)}</span>
      {left <= 0 ? (
        <span className="ef-hint" role="status">
          Tempo scaduto: puoi continuare.
        </span>
      ) : null}
      <button
        type="button"
        className="ef-link"
        onClick={() => {
          setEndsAt(null);
        }}
      >
        Ferma
      </button>
    </div>
  );
}
