import type { StudyLanguage } from '@epicfeed/feed';
import type { RefObject } from 'react';
import { Icon } from './icons';

/**
 * Barra in alto del feed: capitolo e lezione (apre l'indice), punti e serie
 * della sessione, anello dei 5 minuti e lingua della scheda.
 *
 * @param props.title - Capitolo e lezione della scheda visibile.
 * @param props.showPoints - Mostra punti e serie (da Io).
 * @param props.points - Punti della sessione.
 * @param props.streak - Risposte giuste di fila.
 * @param props.minutes - Minuti di sessione trascorsi.
 * @param props.ringRef - Anello: il client ne aggiorna l'avanzamento (`--ef-ring`).
 * @param props.language - Lingua della scheda visibile.
 * @param props.onChapters - Apre l'indice dei capitoli.
 * @param props.onLanguage - Cambia la lingua della scheda.
 */
export function FeedHud({
  title,
  showPoints,
  points,
  streak,
  minutes,
  ringRef,
  language,
  onChapters,
  onLanguage,
}: {
  title: string;
  showPoints: boolean;
  points: number;
  streak: number;
  minutes: number;
  ringRef: RefObject<HTMLDivElement | null>;
  language: StudyLanguage;
  onChapters: () => void;
  onLanguage: () => void;
}) {
  return (
    <header className="ef-hud">
      <button
        type="button"
        className="ef-chip"
        onClick={onChapters}
        aria-label="Scegli capitolo o lezione"
      >
        <span>{title}</span>
        <Icon name="chevron" />
      </button>
      {showPoints ? (
        <>
          <span className="ef-stat" aria-label={`${points} punti`}>
            <Icon name="bolt" />
            <span key={points} className={points > 0 ? 'ef-pop' : ''}>
              {points}
            </span>
          </span>
          <span className={`ef-stat ${streak >= 2 ? 'hot' : ''}`} aria-label={`Serie di ${streak}`}>
            <Icon name="flame" />
            {streak}
          </span>
        </>
      ) : null}
      <div ref={ringRef} className="ef-ring" aria-label={`${minutes} minuti su 5`} role="img">
        <svg viewBox="0 0 30 30" aria-hidden="true">
          <circle className="bg" cx="15" cy="15" r="13" />
          <circle className="fg" cx="15" cy="15" r="13" />
        </svg>
        <span aria-hidden="true">{Math.min(5, minutes)}′</span>
      </div>
      <button
        type="button"
        className="ef-lang"
        onClick={onLanguage}
        aria-label="Cambia lingua della scheda"
      >
        {language.toUpperCase()}
      </button>
    </header>
  );
}
