'use client';

import { MODULE_QUIZ_SIZE } from '@study-feed/core';
import { useEffect, useMemo, useState } from 'react';
import type { SubjectFeed } from '../feed/model';
import { useLocalValue } from '../feed/local-state';
import type { ReviewCatalog } from '../review/catalog';
import type { ExamCatalog, ExamExerciseItem } from './catalog';
import { examScores } from './exam-state';
import { ExerciseView } from './exercise-view';
import { ModuleQuiz } from './module-quiz';
import { PythonRunner } from './python-runner';
import { useExamData } from './use-exam-data';

/** Schermata aperta nella sezione. */
type View =
  | { readonly kind: 'home' }
  | { readonly kind: 'quiz'; readonly chapterIndex: number; readonly run: number }
  | { readonly kind: 'exercise'; readonly key: string };

/**
 * Sezione **Esame** del tab Ripasso (M4, ADR 0014 e 0017), tutta in
 * inglese: quiz di modulo da 50 domande ed esercizi d'esame (banca dello
 * studente e domande aperte delle lezioni).
 *
 * @param props.feed - Materia scaricata, oppure `null` se non c'è ancora.
 * @param props.reviewCatalog - Catalogo del ripasso (nomi dei concetti).
 * @param props.nonce - Nonce della CSP, per gli stili dell'editor del codice.
 */
export function ExamSection({
  feed,
  reviewCatalog,
  nonce,
}: {
  feed: SubjectFeed | null;
  reviewCatalog: ReviewCatalog | null;
  nonce: string | null;
}) {
  const data = useExamData(feed);
  const [view, setView] = useState<View>({ kind: 'home' });
  // Un solo esecutore Python per la sezione: Pyodide si carica al primo test e una volta sola.
  const [runner] = useState(() => new PythonRunner());
  useEffect(
    () => () => {
      runner.dispose();
    },
    [runner],
  );

  const conceptNames = useMemo(() => {
    const names = new Map<string, string>();
    if (!reviewCatalog) return names;
    for (const concept of reviewCatalog.concepts) names.set(concept.key, concept.name.en);
    return names;
  }, [reviewCatalog]);

  if (!feed) {
    return (
      <section className="ef-panel ef-rv-box">
        <p>Importa e genera una lezione: le domande d’esame partono dal feed della materia.</p>
      </section>
    );
  }
  if (data.status === 'loading') return <p className="ef-rv-note">Carico le domande d’esame…</p>;
  if (data.status === 'error') {
    return (
      <section className="ef-panel ef-rv-box">
        <p>Non riesco a caricare l’esame. Riprova quando c’è la connessione.</p>
      </section>
    );
  }

  const { catalog } = data;
  const home = () => {
    setView({ kind: 'home' });
    window.scrollTo({ top: 0 });
  };

  if (view.kind === 'quiz') {
    const selected = catalog.modules.find((item) => item.chapterIndex === view.chapterIndex);
    if (selected) {
      return (
        <ModuleQuiz
          key={view.run}
          module={selected}
          subjectId={feed.subjectId}
          conceptNames={conceptNames}
          onExit={home}
        />
      );
    }
  }
  if (view.kind === 'exercise') {
    const exercise = catalog.exercisesByKey.get(view.key);
    if (exercise) {
      return (
        <ExerciseView
          key={exercise.key}
          exercise={exercise}
          subjectId={feed.subjectId}
          nonce={nonce}
          runner={runner}
          conceptNames={conceptNames}
          onExit={home}
        />
      );
    }
  }

  return (
    <ExamHome
      catalog={catalog}
      offline={data.offline}
      onQuiz={(chapterIndex) => {
        setView({ kind: 'quiz', chapterIndex, run: Date.now() });
        window.scrollTo({ top: 0 });
      }}
      onExercise={(key) => {
        setView({ kind: 'exercise', key });
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

/** Home della sezione: quiz per modulo ed elenco degli esercizi. */
function ExamHome({
  catalog,
  offline,
  onQuiz,
  onExercise,
}: {
  catalog: ExamCatalog;
  offline: boolean;
  onQuiz: (chapterIndex: number) => void;
  onExercise: (key: string) => void;
}) {
  const scores = useLocalValue(examScores);
  const bank = catalog.exercises.filter((exercise) => exercise.group !== 'lesson');
  const lessons = catalog.exercises.filter((exercise) => exercise.group === 'lesson');

  return (
    <>
      <section className="ef-panel ef-rv-box" aria-labelledby="ex-intro">
        <h2 id="ex-intro" className="ef-rv-label">
          Allenati come all’esame
        </h2>
        <p className="ef-rv-note">
          Tutto in inglese. Ogni risposta entra nel ripasso dei suoi concetti.
          {offline ? ' Sei offline: usi la copia sul dispositivo.' : ''}
        </p>
        {catalog.packs.ready < catalog.packs.lessons ? (
          <p className="ef-rv-note">
            Domande d’esame pronte per {catalog.packs.ready} lezioni su {catalog.packs.lessons}. Per
            le altre chiedi a Claude Desktop «genera le domande d’esame di EpicFeed».
          </p>
        ) : null}
      </section>

      <section className="ef-section" aria-labelledby="ex-modules">
        <h2 id="ex-modules">Quiz di modulo</h2>
        <ul className="ef-panel ef-ex-list">
          {catalog.modules.map((module) => (
            <li key={module.chapterIndex}>
              <button
                type="button"
                className="ef-row-link"
                onClick={() => {
                  onQuiz(module.chapterIndex);
                }}
              >
                <span>{module.title}</span>
                <span className="ef-hint">
                  {Math.min(MODULE_QUIZ_SIZE, module.questions.length)} domande
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ef-section" aria-labelledby="ex-bank">
        <h2 id="ex-bank">Esercizi d’esame</h2>
        {bank.length > 0 ? (
          <ExerciseList exercises={bank} scores={scores} onOpen={onExercise} />
        ) : (
          <p className="ef-panel ef-rv-box ef-rv-note">
            Nessuna banca degli esercizi. In Claude Desktop chiedi «crea la banca degli esercizi
            d’esame di EpicFeed» indicando lo zip delle slide del corso: Claude trascrive gli
            esercizi dell’Exam Prep e ne scrive 2 varianti ciascuno.
          </p>
        )}
      </section>

      {lessons.length > 0 ? (
        <section className="ef-section" aria-labelledby="ex-lessons">
          <h2 id="ex-lessons">Domande aperte delle lezioni</h2>
          <ExerciseList exercises={lessons} scores={scores} onOpen={onExercise} />
        </section>
      ) : null}
    </>
  );
}

const GROUP_SHORT: Record<ExamExerciseItem['group'], string> = {
  official: 'Ufficiale',
  variant: 'Variante',
  lesson: 'Lezione',
};

/** Elenco di esercizi con tipo, origine e ultimo punteggio. */
function ExerciseList({
  exercises,
  scores,
  onOpen,
}: {
  exercises: readonly ExamExerciseItem[];
  scores: Readonly<Record<string, number>>;
  onOpen: (key: string) => void;
}) {
  return (
    <ul className="ef-panel ef-ex-list">
      {exercises.map((exercise) => {
        const score = scores[exercise.key];
        return (
          <li key={exercise.key} className={exercise.group === 'variant' ? 'variant' : ''}>
            <button
              type="button"
              className="ef-row-link"
              onClick={() => {
                onOpen(exercise.key);
              }}
            >
              <span>
                <span lang="en">{exercise.title}</span>
                <small className="ef-hint">
                  {GROUP_SHORT[exercise.group]} · {exercise.kind} · {exercise.context}
                </small>
              </span>
              <span className="ef-hint">
                {score === undefined ? '' : `${Math.round(score * 100)}%`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
