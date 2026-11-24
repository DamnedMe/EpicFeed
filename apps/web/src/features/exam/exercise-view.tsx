'use client';

import type { CodeTestOutcome } from '@study-feed/core';
import { gradeFromScore, rubricScore, testPassed } from '@study-feed/core';
import { useEffect, useRef, useState } from 'react';
import { useLocalValue } from '../feed/local-state';
import { readValue, removeValue, STORAGE_KEYS, writeValue } from '../feed/storage';
import { recordStudyAnswer } from '../review/record';
import { z } from 'zod';
import type { ExamExerciseItem } from './catalog';
import { CodeEditor } from './code-editor';
import { examPrefs, examScores } from './exam-state';
import { ExerciseTimer } from './exercise-timer';
import type { PythonRunner, RunResult } from './python-runner';

const GROUP_LABEL: Record<ExamExerciseItem['group'], string> = {
  official: 'Ufficiale',
  variant: 'Variante',
  lesson: 'Dalla lezione',
};

const KIND_LABEL: Record<ExamExerciseItem['kind'], string> = {
  code: 'Code',
  explain: 'Explain',
  analyze: 'Analyze',
};

/** Bozza iniziale: quella salvata, altrimenti la firma della funzione da completare. */
function initialAnswer(exercise: ExamExerciseItem): string {
  const draft = readValue(STORAGE_KEYS.examDraft(exercise.key), z.string().max(20_000), '');
  if (draft) return draft;
  return exercise.kind === 'code' && exercise.signature ? `${exercise.signature}\n    ` : '';
}

/**
 * Esercizio d'esame (ADR 0014 §3–5): consegna in inglese, timer facoltativo,
 * suggerimenti uno alla volta nella lingua scelta, risposta in un editor di
 * codice o di testo, test del codice nel browser, poi soluzione modello e
 * autovalutazione con la griglia. Il punteggio entra nel ripasso dei concetti.
 *
 * @param props.exercise - Esercizio.
 * @param props.subjectId - Materia (per il ripasso).
 * @param props.nonce - Nonce della CSP per l'editor.
 * @param props.runner - Esecutore dei test Python, condiviso dalla sezione.
 * @param props.conceptNames - Nome inglese dei concetti, per chiave.
 * @param props.onExit - Torna alla sezione Esame.
 */
export function ExerciseView({
  exercise,
  subjectId,
  nonce,
  runner,
  conceptNames,
  onExit,
}: {
  exercise: ExamExerciseItem;
  subjectId: string;
  nonce: string | null;
  runner: PythonRunner;
  conceptNames: ReadonlyMap<string, string>;
  onExit: () => void;
}) {
  const prefs = useLocalValue(examPrefs);
  const [answer, setAnswer] = useState(() => initialAnswer(exercise));
  const [hints, setHints] = useState(0);
  const [run, setRun] = useState<RunResult | 'running' | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [awarded, setAwarded] = useState<readonly number[]>(() => exercise.rubric.map(() => 0));
  const [saved, setSaved] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // La bozza si salva poco dopo l'ultima modifica: si può uscire e riprendere.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (answer.trim()) writeValue(STORAGE_KEYS.examDraft(exercise.key), answer);
    }, 500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [answer, exercise.key]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const runTests = async () => {
    setRun('running');
    setRun(await runner.run(answer, exercise.tests));
  };

  const score = rubricScore(exercise.rubric, awarded);
  const totalPoints = exercise.rubric.reduce((sum, criterion) => sum + criterion.points, 0);

  const saveScore = () => {
    const grade = gradeFromScore(score);
    for (const conceptKey of exercise.conceptKeys) {
      void recordStudyAnswer({
        subjectId,
        conceptKey,
        questionId: exercise.key,
        source: 'exercise',
        grade,
        language: 'en',
      });
    }
    examScores.set((previous) => ({ ...previous, [exercise.key]: score }));
    removeValue(STORAGE_KEYS.examDraft(exercise.key));
    setSaved(score);
  };

  return (
    <section className="ef-ex" aria-labelledby="ex-title">
      <div className="ef-ex-bar">
        <button type="button" className="ef-link" onClick={onExit}>
          ← Esame
        </button>
        <ExerciseTimer />
      </div>

      <p className="ef-tag">
        <span className="k">{GROUP_LABEL[exercise.group]}</span>
        <span>
          {KIND_LABEL[exercise.kind]} · {exercise.context}
        </span>
      </p>
      <h2 id="ex-title" ref={headingRef} tabIndex={-1} className="ef-ex-question" lang="en">
        {exercise.title}
      </h2>
      <p className="ef-ex-prompt" lang="en">
        {exercise.prompt}
      </p>
      {exercise.code ? (
        <pre className="ef-ex-code" lang="en">
          <code>{exercise.code}</code>
        </pre>
      ) : null}
      {exercise.tests.length > 0 ? (
        <div className="ef-ex-examples" lang="en">
          <span className="ef-hint">Examples</span>
          <ul>
            {exercise.tests.map((test) => (
              <li key={test.call}>
                <code>{test.call}</code> → <code>{test.expected}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {exercise.hints.length > 0 ? (
        <div className="ef-ex-hints">
          <div className="ef-ex-row">
            <button
              type="button"
              className="ef-link"
              disabled={hints >= exercise.hints.length}
              onClick={() => {
                setHints(hints + 1);
              }}
            >
              {hints === 0
                ? 'Mostra un suggerimento'
                : hints < exercise.hints.length
                  ? `Un altro suggerimento (${hints}/${exercise.hints.length})`
                  : `Suggerimenti ${hints}/${exercise.hints.length}`}
            </button>
            {hints > 0 ? (
              <button
                type="button"
                className="ef-lang"
                aria-label="Lingua dei suggerimenti"
                onClick={() => {
                  examPrefs.set({ hintLanguage: prefs.hintLanguage === 'it' ? 'en' : 'it' });
                }}
              >
                {prefs.hintLanguage.toUpperCase()}
              </button>
            ) : null}
          </div>
          {hints > 0 ? (
            <ol className="ef-ex-hint-list" lang={prefs.hintLanguage}>
              {exercise.hints.slice(0, hints).map((hint, i) => (
                <li key={i}>{hint[prefs.hintLanguage]}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <div className="ef-section">
        <h2>La tua risposta (in inglese)</h2>
        {exercise.kind === 'code' ? (
          <CodeEditor value={answer} onChange={setAnswer} nonce={nonce} label="Your code" />
        ) : (
          <textarea
            className="ef-ex-text"
            aria-label="Your answer"
            lang="en"
            rows={8}
            value={answer}
            placeholder="Write your answer in English…"
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
          />
        )}
        {exercise.kind === 'code' && exercise.tests.length > 0 ? (
          <>
            <button
              type="button"
              className="ef-cta ef-ex-run"
              disabled={run === 'running' || !answer.trim()}
              onClick={() => {
                void runTests();
              }}
            >
              {run === 'running' ? 'Eseguo i test…' : 'Esegui i test'}
            </button>
            <TestResults run={run} firstRun={!runner.loaded} />
          </>
        ) : null}
      </div>

      {revealed ? (
        <div className="ef-section">
          <h2>Soluzione modello</h2>
          <pre className="ef-ex-code" lang="en">
            <code>{exercise.modelAnswer}</code>
          </pre>
          <h2>Autovalutazione</h2>
          <ul className="ef-panel ef-ex-rubric" lang="en">
            {exercise.rubric.map((criterion, i) => (
              <li key={criterion.criterion}>
                <span>{criterion.criterion}</span>
                <div className="ef-seg" role="group" aria-label={`Punti: ${criterion.criterion}`}>
                  {Array.from({ length: criterion.points + 1 }, (_, value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={awarded[i] === value}
                      disabled={saved !== null}
                      onClick={() => {
                        setAwarded(awarded.map((old, j) => (j === i ? value : old)));
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="ef-rv-note">
            {Math.round(score * totalPoints)}/{totalPoints} punti ({Math.round(score * 100)}%)
          </p>
          {saved === null ? (
            <button type="button" className="ef-cta" onClick={saveScore}>
              Salva il punteggio
            </button>
          ) : (
            <div className="ef-fb" role="status">
              <p>
                Punteggio salvato: {Math.round(saved * 100)}%. Il ripasso di{' '}
                <span lang="en">
                  {exercise.conceptKeys.map((key) => conceptNames.get(key) ?? key).join(', ')}
                </span>{' '}
                è aggiornato.
              </p>
              <p lang="en">
                <b>Follow-up: </b>
                {exercise.followUp}
              </p>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="ef-link"
          onClick={() => {
            setRevealed(true);
          }}
        >
          Mostra soluzione e griglia
        </button>
      )}
    </section>
  );
}

/** Esito dei test: quali esempi passano, output e problemi. */
function TestResults({ run, firstRun }: { run: RunResult | 'running' | null; firstRun: boolean }) {
  if (run === null) return null;
  if (run === 'running') {
    return (
      <p className="ef-rv-note" role="status">
        {firstRun
          ? 'Preparo Python nel browser (la prima volta scarica circa 10 MB, poi resta sul dispositivo)…'
          : 'Eseguo i test…'}
      </p>
    );
  }
  if (run.status === 'timeout') {
    return (
      <p className="ef-fb" role="status">
        Tempo scaduto: il codice ci mette più di 5 secondi per test. C’è un ciclo infinito?
      </p>
    );
  }
  if (run.status === 'unavailable') {
    return (
      <p className="ef-fb" role="status">
        Non riesco ad avviare Python in questo browser. Riprova più tardi, con la connessione.
      </p>
    );
  }
  const passed = run.outcomes.filter(testPassed).length;
  return (
    <div className="ef-ex-results" role="status">
      <p>
        <b>
          {passed}/{run.outcomes.length}
        </b>{' '}
        test superati
      </p>
      {run.setupError ? (
        <p className="ef-fb mono" lang="en">
          {run.setupError}
        </p>
      ) : null}
      <ul lang="en">
        {run.outcomes.map((outcome: CodeTestOutcome) => {
          const ok = testPassed(outcome);
          return (
            <li key={outcome.call} className={ok ? 'ok' : 'ko'}>
              <span aria-label={ok ? 'superato' : 'non superato'}>{ok ? '✓' : '✗'}</span>
              <code>{outcome.call}</code>
              {ok ? null : (
                <small>
                  expected <code>{outcome.expected}</code>
                  {outcome.error ? (
                    <>
                      , got <code>{outcome.error}</code>
                    </>
                  ) : (
                    <>
                      , got <code>{outcome.actual}</code>
                    </>
                  )}
                </small>
              )}
            </li>
          );
        })}
      </ul>
      {run.stdout ? (
        <pre className="ef-ex-code">
          <code>{run.stdout}</code>
        </pre>
      ) : null}
    </div>
  );
}
