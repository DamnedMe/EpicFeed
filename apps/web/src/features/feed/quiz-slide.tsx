'use client';

import type { StudyLanguage } from '@epicfeed/feed';
import { POINTS } from '@epicfeed/feed';
import { useEffect, useRef, useState } from 'react';
import { CARD_COPY } from './copy';
import { swipeAnswer } from './gestures';
import type { QuizEntry } from './model';

/** Risposta data: indice dell'opzione o vero/falso. */
export type QuizAnswer = number | boolean;

interface QuizSlideProps {
  readonly entry: QuizEntry;
  readonly language: StudyLanguage;
  readonly answer: QuizAnswer | undefined;
  readonly showPoints: boolean;
  readonly onAnswer: (answer: QuizAnswer, correct: boolean) => void;
  /** Invito dopo la risposta; `null` per nasconderlo (es. nel ripasso, che ha il suo pulsante). */
  readonly continueHint?: string | null;
  /** Domanda cambiata da una correzione dello studente (segno *Corretta da te*). */
  readonly corrected?: boolean;
  /** Tieni premuto: foglio delle azioni (nel feed, per *Segnala errore*). */
  readonly onActions?: () => void;
}

/** Durata della pressione che apre le azioni, come nelle schede. */
const LONG_PRESS_MS = 550;

/**
 * Tieni premuto senza muovere il dito: apre le azioni. Un movimento (swipe di
 * vero/falso, scroll del feed) annulla la pressione.
 *
 * @param onLongPress - Azione, oppure `undefined` per nessuna.
 * @returns I gestori dei puntatori da mettere sull'area della domanda.
 */
function useLongPress(onLongPress: (() => void) | undefined) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => cancel, []);
  if (!onLongPress) return {};
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if ((event.target as Element).closest('button, a')) return;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        cancel();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const from = origin.current;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
    },
  };
}

/** Spiegazione dopo la risposta. */
function Feedback({ correct, lead, text }: { correct: boolean; lead: string; text: string }) {
  return (
    <div className={`ef-fb ${correct ? 'good' : ''}`} role="status">
      <b>{lead}</b>
      {text}
    </div>
  );
}

/** Domanda a scelta multipla: un tocco sull'opzione. */
function MultipleChoice({ entry, language, answer, onAnswer }: QuizSlideProps) {
  const quiz = entry.quiz;
  if (quiz.kind !== 'multiple_choice') return null;
  const copy = CARD_COPY[language];
  const answered = typeof answer === 'number';
  return (
    <>
      <div className="ef-opts">
        {quiz.options[language].map((option, index) => {
          const isCorrect = index === quiz.correctIndex;
          const mine = answer === index;
          return (
            <button
              key={index}
              type="button"
              className={`ef-opt ${answered && isCorrect ? 'ok' : ''} ${answered && mine ? 'mine' : ''}`}
              disabled={answered}
              onClick={() => {
                onAnswer(index, isCorrect);
              }}
            >
              <span className="l">{String.fromCharCode(65 + index)}</span>
              <span>{option}</span>
              <span className="r">
                {answered && isCorrect ? `✓ ${copy.correct}` : answered && mine ? copy.yours : ''}
              </span>
            </button>
          );
        })}
      </div>
      {answered ? (
        <Feedback
          correct={answer === quiz.correctIndex}
          lead={answer === quiz.correctIndex ? copy.right : copy.wrong}
          text={quiz.explanation[language]}
        />
      ) : null}
    </>
  );
}

/** Domanda vero/falso: swipe della carta o pulsanti. */
function TrueFalse({ entry, language, answer, onAnswer }: QuizSlideProps) {
  const quiz = entry.quiz;
  const copy = CARD_COPY[language];
  const cardRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  if (quiz.kind !== 'true_false') return null;

  const move = (dx: number) => {
    // Variabili CSS dal client: niente `style` reso dal server (CSP).
    cardRef.current?.style.setProperty('--ef-dx', `${dx}px`);
    cardRef.current?.style.setProperty('--ef-rot', `${dx / 20}deg`);
  };
  const answerWith = (value: boolean) => {
    onAnswer(value, value === quiz.answer);
  };

  if (typeof answer === 'boolean') {
    const correct = answer === quiz.answer;
    return (
      <>
        <div className="ef-swipe">
          <div className="ef-swcard">{quiz.question[language]}</div>
        </div>
        <Feedback
          correct={correct}
          lead={`${correct ? copy.right : copy.wrong} ${quiz.answer ? copy.true : copy.false}.`}
          text={quiz.explanation[language]}
        />
      </>
    );
  }
  return (
    <>
      <div className="ef-swipe">
        <div
          ref={cardRef}
          className={`ef-swcard ${dragging ? 'dragging' : ''}`}
          onPointerDown={(event) => {
            start.current = { x: event.clientX, y: event.clientY };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            const dx = event.clientX - start.current.x;
            if (Math.abs(dx) > Math.abs(event.clientY - start.current.y)) move(dx);
          }}
          onPointerUp={(event) => {
            const from = start.current;
            start.current = null;
            setDragging(false);
            move(0);
            if (!from) return;
            const result = swipeAnswer(event.clientX - from.x, event.clientY - from.y);
            if (result !== null) answerWith(result);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            move(0);
          }}
        >
          {quiz.question[language]}
        </div>
      </div>
      <span className="ef-hint">{copy.swipe}</span>
      <div className="ef-swbtns">
        <button
          type="button"
          onClick={() => {
            answerWith(false);
          }}
        >
          ← {copy.false}
        </button>
        <button
          type="button"
          onClick={() => {
            answerWith(true);
          }}
        >
          {copy.true} →
        </button>
      </div>
    </>
  );
}

/**
 * Domanda nel feed (ADR 0015, punto 2) e nel ripasso (ADR 0017): risposta e
 * spiegazione subito; il risultato entra nel ripasso del concetto.
 */
export function QuizSlide(props: QuizSlideProps) {
  const copy = CARD_COPY[props.language];
  const isTrueFalse = props.entry.quiz.kind === 'true_false';
  const batch = props.entry.batch;
  const press = useLongPress(props.onActions);
  return (
    <div className="ef-stage" {...press}>
      <div className="ef-tag">
        <span className="k">{isTrueFalse ? copy.trueFalse : copy.check}</span>
        {batch.size > 1 ? (
          <span aria-label={`${copy.question} ${batch.position} / ${batch.size}`}>
            {batch.position}/{batch.size}
          </span>
        ) : null}
        {props.showPoints ? <span>+{POINTS.answer}</span> : null}
        {props.corrected ? <span className="ef-fixed-mark">{copy.corrected}</span> : null}
      </div>
      {isTrueFalse ? null : (
        <h2 className="ef-big sm">{props.entry.quiz.question[props.language]}</h2>
      )}
      {isTrueFalse ? <TrueFalse {...props} /> : <MultipleChoice {...props} />}
      {props.answer !== undefined && props.continueHint !== null ? (
        <span className="ef-hint">{props.continueHint ?? `${copy.nextCard} ↑`}</span>
      ) : null}
      {props.onActions ? (
        <div className="ef-a11y">
          <button type="button" onClick={props.onActions}>
            Altre azioni
          </button>
        </div>
      ) : null}
    </div>
  );
}
