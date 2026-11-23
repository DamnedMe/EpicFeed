'use client';

import type { PlannedReview, StudyLanguage } from '@study-feed/core';
import { answerPoints, gradeFromAnswer, POINTS } from '@study-feed/core';
import { useEffect, useRef, useState } from 'react';
import { CARD_COPY } from '../feed/copy';
import { Icon } from '../feed/icons';
import { preferences, stats, useLocalValue } from '../feed/local-state';
import type { QuizAnswer } from '../feed/quiz-slide';
import { QuizSlide } from '../feed/quiz-slide';
import type { ReviewCatalog } from './catalog';
import { recallBlank } from './catalog';
import { recordStudyAnswer } from './record';

/** Riepilogo di una sessione di ripasso. */
export interface ReviewOutcome {
  readonly concepts: number;
  readonly right: number;
  readonly points: number;
  readonly bestStreak: number;
}

interface ReviewSessionProps {
  readonly catalog: ReviewCatalog;
  readonly plan: readonly PlannedReview[];
  /** Fine della sessione (tutti i concetti fatti) con il riepilogo. */
  readonly onFinish: (outcome: ReviewOutcome) => void;
  /** Uscita anticipata con la freccia: le risposte già date restano registrate. */
  readonly onExit: () => void;
}

type Phase = 'recall' | 'question';

const RING_LENGTH = 81.7;
const EXIT_COPY = { it: 'Esci dal ripasso', en: 'Leave review' } as const;
const RECALL_COPY = {
  it: { tag: 'Da ripassare', early: 'In anticipo', next: 'Tocca per la domanda', go: 'Avanti' },
  en: { tag: 'To review', early: 'Ahead of time', next: 'Tap for the question', go: 'Next' },
} as const;

/**
 * Sessione di ripasso a battute (M4, ADR 0017, scelta 2B): per ogni concetto
 * in scadenza una battuta di richiamo con la parola da indovinare, poi una
 * domanda sul concetto. Stessi punti e stessa serie del feed; ogni risposta
 * aggiorna subito il ripasso FSRS.
 */
export function ReviewSession({ catalog, plan, onFinish, onExit }: ReviewSessionProps) {
  const prefs = useLocalValue(preferences);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('recall');
  const [blankOpen, setBlankOpen] = useState(false);
  const [answer, setAnswer] = useState<QuizAnswer | undefined>(undefined);
  const [language, setLanguage] = useState<StudyLanguage | null>(null);
  const [score, setScore] = useState({ points: 0, streak: 0, bestStreak: 0, right: 0 });
  const ringRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const item = plan[index];
  const concept = item ? catalog.conceptsById.get(item.conceptId) : undefined;
  const question = item ? catalog.questionsById.get(item.questionId) : undefined;
  // Richiamo nella lingua di studio, domanda nella lingua delle domande (inglese di base).
  const shown: StudyLanguage =
    language ?? (phase === 'recall' ? prefs.language : prefs.quizLanguage);
  const copy = RECALL_COPY[shown];

  // Anello: avanzamento nella sessione, aggiornato dal client (niente `style` dal server).
  useEffect(() => {
    const done = plan.length === 0 ? 1 : (index + (phase === 'question' ? 0.5 : 0)) / plan.length;
    ringRef.current?.style.setProperty('--ef-ring', String(RING_LENGTH * (1 - done)));
  }, [index, phase, plan.length]);

  useEffect(() => {
    if (answer !== undefined) continueRef.current?.focus();
  }, [answer]);

  if (!item || !concept || !question) return null;

  const revealBlank = () => {
    if (blankOpen) return;
    setBlankOpen(true);
    setScore((previous) => ({ ...previous, points: previous.points + POINTS.blank }));
  };

  const toQuestion = () => {
    setPhase('question');
    setLanguage(null);
  };

  const onAnswer = (value: QuizAnswer, correct: boolean) => {
    if (answer !== undefined) return;
    setAnswer(value);
    const streak = correct ? score.streak + 1 : 0;
    const gained = correct ? answerPoints(streak) : 0;
    setScore((previous) => ({
      points: previous.points + gained,
      streak,
      bestStreak: Math.max(previous.bestStreak, streak),
      right: previous.right + (correct ? 1 : 0),
    }));
    stats.set((previous) => ({
      ...previous,
      points: previous.points + gained,
      bestStreak: Math.max(previous.bestStreak, streak),
    }));
    void recordStudyAnswer({
      subjectId: catalog.subjectId,
      conceptKey: concept.key,
      questionId: question.key,
      source: 'review',
      grade: gradeFromAnswer(correct),
      language: shown,
    });
  };

  const next = () => {
    if (index + 1 >= plan.length) {
      onFinish({
        concepts: plan.length,
        right: score.right,
        points: score.points,
        bestStreak: score.bestStreak,
      });
      return;
    }
    setIndex(index + 1);
    setPhase('recall');
    setBlankOpen(false);
    setAnswer(undefined);
    setLanguage(null);
  };

  const description = concept.description[shown];
  const blank = recallBlank(concept, shown);

  return (
    <div className="ef-app ef-rv-session" data-motion={prefs.animations ? 'on' : 'off'}>
      <div className="ef-hud">
        <button type="button" className="ef-stat" onClick={onExit} aria-label={EXIT_COPY[shown]}>
          <Icon name="close" />
        </button>
        <span className="ef-stat">
          {index + 1}/{plan.length}
        </span>
        {prefs.points ? <span className="ef-stat">{score.points} pt</span> : null}
        {prefs.points && score.streak >= 2 ? (
          <span className="ef-stat hot">
            <Icon name="flame" />
            {score.streak}
          </span>
        ) : null}
        <span className="ef-rv-grow" />
        <div ref={ringRef} className="ef-ring" aria-hidden="true">
          <svg viewBox="0 0 30 30">
            <circle className="bg" cx="15" cy="15" r="13" />
            <circle className="fg" cx="15" cy="15" r="13" />
          </svg>
        </div>
        <button
          type="button"
          className="ef-lang"
          aria-label={shown === 'it' ? 'Leggi in inglese' : 'Leggi in italiano'}
          onClick={() => {
            setLanguage(shown === 'it' ? 'en' : 'it');
          }}
        >
          {shown.toUpperCase()}
        </button>
      </div>
      <div className="ef-rv-beats" aria-hidden="true">
        <i className="on" />
        <i className={phase === 'question' ? 'on' : ''} />
      </div>
      <div className="ef-slide ef-rv-slide">
        {phase === 'recall' ? (
          <div
            className="ef-stage"
            role="button"
            tabIndex={0}
            aria-label={copy.next}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('.ef-blank')) return;
              if (blank && !blankOpen) revealBlank();
              else toQuestion();
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              if (blank && !blankOpen) revealBlank();
              else toQuestion();
            }}
          >
            <div className="ef-tag">
              <span className="k">{item.reason === 'due' ? copy.tag : copy.early}</span>
              <span>{concept.chapterTitle}</span>
            </div>
            <h2 className="ef-big">{concept.name[shown]}</h2>
            {blank ? (
              <p className="ef-key">
                {description.slice(0, blank.start)}
                <button
                  type="button"
                  className={`ef-blank ${blankOpen ? 'open' : ''}`}
                  onClick={revealBlank}
                  aria-label={blankOpen ? undefined : CARD_COPY[shown].tapBlank}
                >
                  {description.slice(blank.start, blank.end)}
                </button>
                {description.slice(blank.end)}
              </p>
            ) : (
              <p className="ef-key">{description}</p>
            )}
            <span className="ef-hint">
              {blank && !blankOpen ? `${CARD_COPY[shown].tapBlank} (+${POINTS.blank})` : copy.next}
            </span>
          </div>
        ) : (
          <>
            <QuizSlide
              entry={question}
              language={shown}
              answer={answer}
              showPoints={prefs.points}
              onAnswer={onAnswer}
              continueHint={null}
            />
            {answer !== undefined ? (
              <button ref={continueRef} type="button" className="ef-cta" onClick={next}>
                {copy.go}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
