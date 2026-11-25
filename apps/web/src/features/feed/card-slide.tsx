'use client';

import type { CardStory, LineRange, StoryBeat } from '@epicfeed/feed';
import { highlightTerms } from '@epicfeed/feed';
import { useEffect, useRef } from 'react';
import type { Gesture } from './gestures';
import { GestureRecognizer } from './gestures';
import { CARD_COPY } from './copy';
import { formatMinute, type CardEntry } from './model';

/** Stato di una scheda nella sessione. */
export interface CardState {
  readonly beat: number;
  readonly blank: boolean;
}

interface CardSlideProps {
  readonly entry: CardEntry;
  readonly story: CardStory;
  readonly state: CardState;
  readonly saved: boolean;
  /** Scheda cambiata da una correzione dello studente (segno *Corretta da te*). */
  readonly corrected?: boolean;
  /** Durata della battuta in avanzamento automatico (0 se spento). */
  readonly autoMs: number;
  readonly onGesture: (gesture: Gesture) => void;
  readonly onRevealBlank: () => void;
}

/** Testo con i termini del glossario evidenziati. */
function Marked({ text, terms }: { text: string; terms: readonly string[] }) {
  return highlightTerms(text, terms).map((part, index) =>
    part.term ? (
      <b key={index} className="ef-term">
        {part.text}
      </b>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

/** Frase chiave con la parola da indovinare. */
function KeyPoint({
  story,
  open,
  onReveal,
}: {
  story: CardStory;
  open: boolean;
  onReveal: () => void;
}) {
  const { keyPoint, blank } = story;
  if (!blank) return <p className="ef-key">{keyPoint}</p>;
  const word = keyPoint.slice(blank.start, blank.end);
  return (
    <p className="ef-key">
      {keyPoint.slice(0, blank.start)}
      <button
        type="button"
        className={`ef-blank ${open ? 'open' : ''}`}
        onClick={onReveal}
        disabled={open}
        aria-label={open ? word : 'Parola nascosta: tocca per scoprirla'}
      >
        {word}
      </button>
      {keyPoint.slice(blank.end)}
    </p>
  );
}

function inRanges(line: number, ranges: readonly LineRange[] | null): boolean {
  return ranges?.some((range) => line >= range.from && line <= range.to) ?? false;
}

/** Contenuto della battuta corrente, con quanto già letto attenuato sopra. */
function BeatContent({
  story,
  beat,
  state,
  terms,
  onReveal,
}: {
  story: CardStory;
  beat: StoryBeat;
  state: CardState;
  terms: readonly string[];
  onReveal: () => void;
}) {
  const copy = CARD_COPY[story.language];
  switch (beat.kind) {
    case 'title':
      return (
        <>
          {story.duel ? (
            <div className="ef-vs">
              <div className="side l">{story.duel.left}</div>
              <span className="x">VS</span>
              <div className="side">{story.duel.right}</div>
            </div>
          ) : null}
          <h2 className="ef-big">{story.title}</h2>
          <span className="ef-hint">{copy.tapToContinue} →</span>
          <span className="ef-hint">{copy.gestures}</span>
        </>
      );
    case 'key':
      return (
        <>
          <h2 className="ef-big sm">{story.title}</h2>
          <KeyPoint story={story} open={state.blank} onReveal={onReveal} />
          {story.blank && !state.blank ? <span className="ef-hint">{copy.tapBlank}</span> : null}
          {story.kind === 'steps' && story.lines.length > 0 ? (
            <p className="ef-context">{story.lines.join(' ')}</p>
          ) : null}
        </>
      );
    case 'line':
      return (
        <ul className="ef-lines">
          {story.lines.slice(0, beat.index + 1).map((line, index) => (
            <li key={index} className={index < beat.index ? 'old' : 'ef-enter'}>
              <Marked text={line} terms={terms} />
            </li>
          ))}
        </ul>
      );
    case 'step':
      return (
        <>
          <h2 className="ef-big sm">{story.title}</h2>
          <ol className="ef-lines ef-steps">
            {story.steps.slice(0, beat.index + 1).map((step, index) => (
              <li key={index} className={index < beat.index ? 'old' : ''}>
                <span className="n">{index + 1}</span>
                <span>
                  <Marked text={step} terms={terms} />
                </span>
              </li>
            ))}
          </ol>
        </>
      );
    case 'row':
    case 'note': {
      const shown = beat.kind === 'row' ? beat.index + 1 : story.rows.length;
      return (
        <>
          {story.duel ? (
            <div className="ef-vs sm">
              <div className="side l">{story.duel.left}</div>
              <span className="x">VS</span>
              <div className="side">{story.duel.right}</div>
            </div>
          ) : null}
          {story.rows.slice(0, shown).map((row, index) => (
            <div
              key={index}
              className={`ef-row ${index < shown - 1 || beat.kind === 'note' ? 'old' : ''}`}
            >
              <span className="asp">{row.aspect}</span>
              <div className="cell">{row.left}</div>
              <div className="cell">{row.right}</div>
            </div>
          ))}
          {beat.kind === 'note' ? (
            <p className="ef-note">
              <Marked text={story.note} terms={terms} />
            </p>
          ) : null}
        </>
      );
    }
    case 'code': {
      const explanation = story.explanations[beat.index];
      const lines = explanation?.lines ?? null;
      return (
        <>
          <pre
            className={`ef-code ${lines ? '' : 'all'}`}
            aria-label={`Codice ${story.code?.language ?? ''}`}
          >
            <code>
              {story.code?.lines.map((line, index) => (
                <span key={index} className={`ln ${inRanges(index, lines) ? 'on' : ''}`}>
                  {line || ' '}
                </span>
              ))}
            </code>
          </pre>
          <p className="ef-explain">
            <Marked text={explanation?.text ?? ''} terms={terms} />
          </p>
        </>
      );
    }
  }
}

/**
 * Scheda raccontata a battute (ADR 0015, punti 1–3). Tocchi, doppio tocco e
 * pressione lunga arrivano dal {@link GestureRecognizer}; lo scorrimento in su
 * resta allo scroll del feed.
 */
export function CardSlide({
  entry,
  story,
  state,
  saved,
  corrected = false,
  autoMs,
  onGesture,
  onRevealBlank,
}: CardSlideProps) {
  const copy = CARD_COPY[story.language];
  const beats = story.beats;
  const beatIndex = Math.min(state.beat, beats.length - 1);
  const beat = beats[beatIndex] ?? { kind: 'title' as const };
  const gestureRef = useRef(onGesture);
  const recognizer = useRef<GestureRecognizer | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gestureRef.current = onGesture;
  }, [onGesture]);

  useEffect(() => {
    const instance = new GestureRecognizer((gesture) => {
      gestureRef.current(gesture);
    });
    recognizer.current = instance;
    return () => {
      instance.dispose();
    };
  }, []);

  // La durata della battuta è dinamica: la si passa al CSS dal client (la CSP blocca gli `style` del server).
  useEffect(() => {
    barRef.current?.style.setProperty('--ef-beat-ms', `${autoMs}ms`);
  }, [autoMs, beatIndex]);

  const sample = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width };
  };

  return (
    <>
      <div ref={barRef} className="ef-beats" aria-hidden="true">
        {beats.map((_, index) => (
          <i
            key={`${index}-${index === beatIndex ? autoMs : 0}`}
            className={index < beatIndex ? 'done' : index === beatIndex ? 'now' : ''}
          />
        ))}
      </div>
      <div
        className="ef-stage"
        onPointerDown={(event) => {
          if ((event.target as Element).closest('button, a')) return;
          recognizer.current?.down(sample(event));
        }}
        onPointerMove={(event) => recognizer.current?.move(sample(event))}
        onPointerUp={() => recognizer.current?.up()}
        onPointerCancel={() => recognizer.current?.cancel()}
        onPointerLeave={() => recognizer.current?.cancel()}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        <div className="ef-tag">
          {copy.kinds[story.kind] ? <span className="k">{copy.kinds[story.kind]}</span> : null}
          <span>{copy.from[entry.card.origin]}</span>
          {entry.video ? (
            <span>
              · {copy.minute} {formatMinute(entry.video.startMs)}
            </span>
          ) : null}
          {saved ? <span className="saved">· {copy.saved}</span> : null}
          {corrected ? <span className="ef-fixed-mark">{copy.corrected}</span> : null}
        </div>
        <BeatContent
          story={story}
          beat={beat}
          state={state}
          terms={entry.card.terms}
          onReveal={onRevealBlank}
        />
        {beatIndex === beats.length - 1 ? <span className="ef-hint">{copy.nextCard} ↑</span> : null}
      </div>
      <div className="ef-a11y">
        <button
          type="button"
          onClick={() => {
            onGesture('previous');
          }}
        >
          Battuta precedente
        </button>
        <button
          type="button"
          onClick={() => {
            onGesture('next');
          }}
        >
          Battuta successiva
        </button>
        <button
          type="button"
          onClick={() => {
            onGesture('save');
          }}
          aria-pressed={saved}
        >
          {saved ? 'Rimuovi dai salvati' : 'Salva la scheda'}
        </button>
        <button
          type="button"
          onClick={() => {
            onGesture('actions');
          }}
        >
          Altre azioni
        </button>
      </div>
    </>
  );
}
