'use client';

import { drawRandom, gradeFromAnswer, MODULE_QUIZ_SIZE } from '@study-feed/core';
import { useState } from 'react';
import { recordStudyAnswer } from '../review/record';
import type { ExamModule, ExamQuizQuestion } from './catalog';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Quiz di modulo (ADR 0014 §8): 50 domande a scelta multipla in inglese,
 * estratte a caso tra quelle del feed e del pacchetto d'esame del modulo,
 * come l'autovalutazione ufficiale. Ogni risposta entra nel ripasso.
 *
 * @param props.module - Modulo con le sue domande.
 * @param props.subjectId - Materia (per il ripasso dei concetti).
 * @param props.conceptNames - Nome inglese dei concetti, per chiave.
 * @param props.onExit - Torna alla sezione Esame.
 */
export function ModuleQuiz({
  module,
  subjectId,
  conceptNames,
  onExit,
}: {
  module: ExamModule;
  subjectId: string;
  conceptNames: ReadonlyMap<string, string>;
  onExit: () => void;
}) {
  const [questions] = useState(() => drawRandom(module.questions, MODULE_QUIZ_SIZE, Math.random));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<readonly ExamQuizQuestion[]>([]);
  const [done, setDone] = useState(false);

  const total = questions.length;
  const right = index + (picked === null ? 0 : 1) - wrong.length;

  if (done || total === 0) {
    const score = total ? Math.round((right / total) * 100) : 0;
    const concepts = [...new Set(wrong.map((question) => question.conceptKey))];
    return (
      <section className="ef-panel ef-rv-box" aria-labelledby="mq-end" role="status">
        <p className="ef-tag">
          <span className="k">Quiz di modulo</span>
        </p>
        <h2 id="mq-end" className="ef-rv-label">
          {module.title}
        </h2>
        <div className="ef-grid3">
          <div>
            <b>{score}%</b>punteggio
          </div>
          <div>
            <b>
              {right}/{total}
            </b>
            giuste
          </div>
          <div>
            <b>{concepts.length}</b>da rivedere
          </div>
        </div>
        {concepts.length > 0 ? (
          <p className="ef-rv-note">
            Da rivedere (tornano prima nel ripasso):{' '}
            <span lang="en">{concepts.map((key) => conceptNames.get(key) ?? key).join(', ')}</span>.
          </p>
        ) : null}
        <button type="button" className="ef-cta" onClick={onExit}>
          Torna all’Esame
        </button>
      </section>
    );
  }

  const question = questions[index] as ExamQuizQuestion;
  const answered = picked !== null;

  const choose = (option: number) => {
    if (answered) return;
    setPicked(option);
    const correct = option === question.correctIndex;
    if (!correct) setWrong((previous) => [...previous, question]);
    void recordStudyAnswer({
      subjectId,
      conceptKey: question.conceptKey,
      questionId: question.key,
      source: 'quiz',
      grade: gradeFromAnswer(correct),
      language: 'en',
    });
  };

  const next = () => {
    if (index + 1 >= total) {
      setDone(true);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  };

  return (
    <section className="ef-ex" aria-labelledby="mq-question">
      <div className="ef-ex-bar">
        <button type="button" className="ef-link" onClick={onExit}>
          ← Esame
        </button>
        <span className="ef-hint">
          {index + 1}/{total} · {right} giuste
        </span>
      </div>
      {index === 0 && total < MODULE_QUIZ_SIZE ? (
        <p className="ef-rv-note">
          Questo modulo ha {total} domande: il quiz le usa tutte. Con le domande d’esame delle
          lezioni arriva a 50.
        </p>
      ) : null}
      {/* Solo nel browser (si apre con un tocco): lo stile in linea qui non passa dal markup del server. */}
      <div
        className="ef-ex-progress"
        role="progressbar"
        aria-label="Avanzamento"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index + 1}
      >
        <i style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
      <p className="ef-tag">
        <span className="k">{module.title}</span>
      </p>
      <h2 id="mq-question" className="ef-ex-question" lang="en">
        {question.question}
      </h2>
      <div className="ef-opts" role="group" aria-label="Risposte" lang="en">
        {question.options.map((option, i) => {
          const ok = answered && i === question.correctIndex;
          const mine = picked === i;
          return (
            <button
              key={`${question.key}:${i}`}
              type="button"
              className={`ef-opt ${ok ? 'ok' : ''} ${mine ? 'mine' : ''}`}
              disabled={answered}
              aria-pressed={mine}
              onClick={() => {
                choose(i);
              }}
            >
              <span className="l">{LETTERS[i] ?? i + 1}</span>
              <span>{option}</span>
              <span className="r">{ok ? 'Correct' : mine ? 'Your answer' : ''}</span>
            </button>
          );
        })}
      </div>
      {answered ? (
        <>
          <p className="ef-fb" role="status" lang="en">
            <b>{picked === question.correctIndex ? 'Correct. ' : 'Not quite. '}</b>
            {question.explanation}
          </p>
          <button type="button" className="ef-cta" onClick={next}>
            {index + 1 >= total ? 'Vedi il risultato' : 'Avanti'}
          </button>
        </>
      ) : null}
    </section>
  );
}
