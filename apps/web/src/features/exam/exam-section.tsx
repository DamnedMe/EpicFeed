'use client';

import { MODULE_QUIZ_SIZE } from '@epicfeed/core';
import { useEffect, useMemo, useState } from 'react';
import type { SubjectFeed } from '../feed/model';
import { useLocalValue } from '../feed/local-state';
import type { ReviewCatalog } from '../review/catalog';
import { recordStudyAnswer } from '../review/record';
import type { ExamCatalog, ExamExerciseItem } from './catalog';
import { CorrectionView } from './correction-view';
import type { CorrectionEntry } from './corrections';
import { examCorrections, syncCorrections } from './corrections';
import { examScores } from './exam-state';
import { ExerciseView } from './exercise-view';
import { Interview } from './interview';
import { ModuleQuiz } from './module-quiz';
import { PythonRunner } from './python-runner';
import { useExamData } from './use-exam-data';

/** Schermata aperta nella sezione. */
type View =
  | { readonly kind: 'home' }
  | { readonly kind: 'quiz'; readonly chapterIndex: number; readonly run: number }
  | { readonly kind: 'exercise'; readonly key: string }
  | { readonly kind: 'interview'; readonly run: number }
  | { readonly kind: 'correction'; readonly id: string };

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

  // All'apertura si scaricano le correzioni di Claude arrivate nel frattempo.
  useEffect(() => {
    void syncCorrections({
      fetch: (input, init) => fetch(input, init),
      store: examCorrections,
      record: recordStudyAnswer,
      saveScores: (scores) => {
        examScores.set((previous) => ({ ...previous, ...scores }));
      },
    });
  }, []);

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

  if (view.kind === 'interview') {
    return (
      <Interview
        key={view.run}
        exercises={catalog.exercises}
        subjectId={feed.subjectId}
        onExit={home}
      />
    );
  }
  if (view.kind === 'correction') {
    return <CorrectionPage id={view.id} onExit={home} />;
  }

  const open = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <ExamHome
      catalog={catalog}
      offline={data.offline}
      onInterview={() => {
        open({ kind: 'interview', run: Date.now() });
      }}
      onCorrection={(id) => {
        open({ kind: 'correction', id });
      }}
      onQuiz={(chapterIndex) => {
        open({ kind: 'quiz', chapterIndex, run: Date.now() });
      }}
      onExercise={(key) => {
        open({ kind: 'exercise', key });
      }}
    />
  );
}

/** Correzione di un invio, aperta dall'elenco delle correzioni. */
function CorrectionPage({ id, onExit }: { id: string; onExit: () => void }) {
  const entries = useLocalValue(examCorrections);
  const entry = entries.find((candidate) => candidate.id === id);
  return (
    <section className="ef-ex" aria-labelledby="cr-title">
      <div className="ef-ex-bar">
        <button type="button" className="ef-link" onClick={onExit}>
          ← Esame
        </button>
      </div>
      <h2 id="cr-title" className="ef-ex-question">
        {entry?.kind === 'interview' ? entryTitle(entry) : 'Correzione di Claude'}
      </h2>
      {entry ? (
        <>
          {entry.submission.items.length === 1 && entry.submission.items[0] ? (
            <p className="ef-ex-prompt" lang="en">
              {entry.submission.items[0].prompt}
            </p>
          ) : null}
          <CorrectionView entry={entry} />
        </>
      ) : (
        <p className="ef-rv-note">Correzione non più sul dispositivo.</p>
      )}
    </section>
  );
}

/** Titolo di un invio negli elenchi. */
function entryTitle(entry: CorrectionEntry): string {
  if (entry.kind === 'interview') {
    return `Colloquio del ${new Date(entry.createdAt).toLocaleDateString('it-IT')}`;
  }
  const prompt = entry.submission.items[0]?.prompt ?? 'Esercizio';
  return prompt.length > 70 ? `${prompt.slice(0, 69)}…` : prompt;
}

/** Home della sezione: colloquio, quiz per modulo, esercizi e correzioni. */
function ExamHome({
  catalog,
  offline,
  onQuiz,
  onExercise,
  onInterview,
  onCorrection,
}: {
  catalog: ExamCatalog;
  offline: boolean;
  onQuiz: (chapterIndex: number) => void;
  onExercise: (key: string) => void;
  onInterview: () => void;
  onCorrection: (id: string) => void;
}) {
  const scores = useLocalValue(examScores);
  const corrections = useLocalValue(examCorrections);
  const pending = useMemo(
    () =>
      new Set(
        corrections
          .filter((entry) => !entry.correction && entry.kind === 'exercise')
          .flatMap((entry) => entry.submission.items.map((item) => item.key)),
      ),
    [corrections],
  );
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

      {catalog.exercises.length > 0 ? (
        <section className="ef-section" aria-labelledby="ex-interview">
          <h2 id="ex-interview">Colloquio</h2>
          <button type="button" className="ef-panel ef-row-link" onClick={onInterview}>
            <span>
              Simulazione del colloquio
              <small className="ef-hint">20 minuti in chat, domande in inglese</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </section>
      ) : null}

      {corrections.length > 0 ? (
        <section className="ef-section" aria-labelledby="ex-corrections">
          <h2 id="ex-corrections">Correzioni di Claude</h2>
          <ul className="ef-panel ef-ex-list">
            {corrections.slice(0, 10).map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="ef-row-link"
                  onClick={() => {
                    onCorrection(entry.id);
                  }}
                >
                  <span>
                    <span lang={entry.kind === 'interview' ? 'it' : 'en'}>{entryTitle(entry)}</span>
                    <small className="ef-hint">
                      {entry.kind === 'interview' ? 'Colloquio' : 'Esercizio'}
                    </small>
                  </span>
                  <span className="ef-hint">{entryStatus(entry)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
          <ExerciseList exercises={bank} scores={scores} pending={pending} onOpen={onExercise} />
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
          <ExerciseList exercises={lessons} scores={scores} pending={pending} onOpen={onExercise} />
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

/** Stato di un invio: in correzione o punteggio medio della correzione. */
function entryStatus(entry: CorrectionEntry): string {
  if (!entry.correction) return 'In correzione';
  let got = 0;
  let total = 0;
  for (const correction of entry.correction.items) {
    const item = entry.submission.items.find((candidate) => candidate.key === correction.key);
    if (!item) continue;
    item.rubric.forEach((criterion, i) => {
      total += criterion.points;
      got += Math.min(criterion.points, correction.scores[i] ?? 0);
    });
  }
  return total === 0 ? 'Corretto' : `${Math.round((got / total) * 100)}%`;
}

/** Elenco di esercizi con tipo, origine e ultimo punteggio. */
function ExerciseList({
  exercises,
  scores,
  pending,
  onOpen,
}: {
  exercises: readonly ExamExerciseItem[];
  scores: Readonly<Record<string, number>>;
  pending: ReadonlySet<string>;
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
                {pending.has(exercise.key)
                  ? 'In correzione'
                  : score === undefined
                    ? ''
                    : `${Math.round(score * 100)}%`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
