'use client';

import { gradeFromScore, rubricScore } from '@epicfeed/core';
import { useEffect, useRef, useState } from 'react';
import { useLocalValue } from '../feed/local-state';
import { recordStudyAnswer } from '../review/record';
import type { ExamExerciseItem } from './catalog';
import { CorrectionView } from './correction-view';
import type { SubmitOutcome } from './corrections';
import {
  examCorrections,
  MAX_ANSWER_CHARS,
  submissionItemFor,
  submitForCorrection,
} from './corrections';
import { SendToClaude } from './exercise-view';
import { INTERVIEW_MINUTES, INTERVIEW_QUESTIONS, pickInterviewQuestions } from './interview-plan';

/** Risposte a una domanda: la principale e quella all'approfondimento. */
interface Turn {
  readonly answer: string;
  readonly followUpAnswer: string | null;
}

/** Fase della simulazione. */
type Phase = 'intro' | 'chat' | 'end';

/** Minuti e secondi rimasti. */
function clock(seconds: number): string {
  const value = Math.max(0, seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/**
 * Simulazione del colloquio in chat (ADR 0014 §7, ADR 0017): 20 minuti,
 * domande in inglese una alla volta, dopo ogni risposta la domanda di
 * approfondimento; niente suggerimenti. Alla fine soluzioni modello,
 * autovalutazione e invio a Claude dell'intero colloquio.
 *
 * @param props.exercises - Esercizi della materia, da cui si scelgono le domande.
 * @param props.subjectId - Materia (per il ripasso e l'invio).
 * @param props.onExit - Torna alla sezione Esame.
 */
export function Interview({
  exercises,
  subjectId,
  onExit,
}: {
  exercises: readonly ExamExerciseItem[];
  subjectId: string;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [questions, setQuestions] = useState<ExamExerciseItem[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(0);

  // Tempo che scorre durante la chat; a zero il colloquio finisce.
  useEffect(() => {
    if (phase !== 'chat') return;
    const tick = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, [phase]);

  const left = Math.round((endsAt - now) / 1000);
  const timeUp = phase === 'chat' && left <= 0;

  const start = () => {
    const picked = pickInterviewQuestions(exercises, Math.random);
    const begin = Date.now();
    setQuestions(picked);
    setTurns([]);
    setDraft('');
    setNow(begin);
    setEndsAt(begin + INTERVIEW_MINUTES * 60_000);
    setPhase('chat');
  };

  // Domanda in corso e se si aspetta la risposta all'approfondimento.
  const last = turns.at(-1);
  // Ultima domanda già risposta ma senza la risposta all'approfondimento.
  const openTurn = last?.followUpAnswer === null ? last : undefined;
  const awaitingFollowUp = openTurn !== undefined;
  const index = awaitingFollowUp ? turns.length - 1 : turns.length;
  const current = questions[index];

  const finish = (pending = draft) => {
    // Quanto scritto e non inviato allo scadere conta come risposta.
    if (pending.trim()) {
      if (openTurn) {
        setTurns([...turns.slice(0, -1), { ...openTurn, followUpAnswer: pending }]);
      } else if (current) {
        setTurns([...turns, { answer: pending, followUpAnswer: null }]);
      }
    }
    setDraft('');
    setPhase('end');
  };

  useEffect(() => {
    // A tempo scaduto si chiude il colloquio (stato esterno: l'orologio).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (timeUp) finish();
  });

  const send = () => {
    if (!draft.trim() || !current) return;
    let next: Turn[];
    if (openTurn) {
      next = [...turns.slice(0, -1), { ...openTurn, followUpAnswer: draft }];
    } else {
      next = [...turns, { answer: draft, followUpAnswer: null }];
    }
    setTurns(next);
    setDraft('');
    const done = next.length >= questions.length && next.at(-1)?.followUpAnswer !== null;
    if (done) setPhase('end');
  };

  if (phase === 'intro') {
    return (
      <section className="ef-ex" aria-labelledby="iv-title">
        <div className="ef-ex-bar">
          <button type="button" className="ef-link" onClick={onExit}>
            ← Esame
          </button>
        </div>
        <h2 id="iv-title" className="ef-ex-question">
          Simulazione del colloquio
        </h2>
        <p className="ef-rv-note">
          {INTERVIEW_MINUTES} minuti, {INTERVIEW_QUESTIONS} domande in inglese una alla volta, come
          al colloquio finale. Dopo ogni risposta arriva una domanda di approfondimento. Niente
          suggerimenti: rispondi scrivendo. Alla fine vedi le soluzioni e puoi far correggere tutto
          a Claude.
        </p>
        <button type="button" className="ef-cta" disabled={exercises.length === 0} onClick={start}>
          Inizia il colloquio
        </button>
      </section>
    );
  }

  if (phase === 'end') {
    return (
      <InterviewEnd
        questions={questions.slice(0, turns.length)}
        turns={turns}
        subjectId={subjectId}
        onRestart={start}
        onExit={onExit}
      />
    );
  }

  return (
    <section className="ef-ex" aria-labelledby="iv-title">
      <div className="ef-ex-bar">
        <h2 id="iv-title" className="ef-rv-label">
          Colloquio · domanda {Math.min(index + 1, questions.length)}/{questions.length}
        </h2>
        <span className="ef-ex-timer on" role="timer" aria-live="off">
          <span className={`ef-stat ${left <= 60 ? 'hot' : ''}`}>{clock(left)}</span>
        </span>
      </div>
      <ol className="ef-iv-chat" lang="en" aria-live="polite">
        {turns.map((turn, i) => {
          const question = questions[i];
          if (!question) return null;
          return <ChatTurn key={question.key} question={question} turn={turn} />;
        })}
        {current && !awaitingFollowUp ? <Asked question={current} /> : null}
      </ol>
      <div className="ef-iv-compose">
        <textarea
          className={`ef-ex-text ${current?.kind === 'code' && !awaitingFollowUp ? 'mono' : ''}`}
          aria-label="Your answer"
          lang="en"
          value={draft}
          maxLength={MAX_ANSWER_CHARS}
          placeholder="Answer in English…"
          spellCheck={current?.kind !== 'code'}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <div className="ef-ex-row">
          <button
            type="button"
            className="ef-link"
            onClick={() => {
              finish();
            }}
          >
            Termina qui
          </button>
          <button type="button" className="ef-cta" disabled={!draft.trim()} onClick={send}>
            Rispondi
          </button>
        </div>
      </div>
    </section>
  );
}

/** Domanda dell'intervistatore, con il codice da analizzare se c'è. */
function Asked({ question }: { question: ExamExerciseItem }) {
  return (
    <li className="them">
      {question.prompt}
      {question.code ? (
        <pre>
          <code>{question.code}</code>
        </pre>
      ) : null}
    </li>
  );
}

/** Domanda, risposta, approfondimento e risposta all'approfondimento. */
function ChatTurn({ question, turn }: { question: ExamExerciseItem; turn: Turn }) {
  return (
    <>
      <Asked question={question} />
      <li className={`me ${question.kind === 'code' ? 'code' : ''}`}>{turn.answer}</li>
      <li className="them">{question.followUp}</li>
      {turn.followUpAnswer !== null ? <li className="me">{turn.followUpAnswer}</li> : null}
    </>
  );
}

/**
 * Fine del colloquio: soluzioni modello, autovalutazione per domanda e invio
 * a Claude; la correzione compare qui quando arriva.
 */
function InterviewEnd({
  questions,
  turns,
  subjectId,
  onRestart,
  onExit,
}: {
  questions: readonly ExamExerciseItem[];
  turns: readonly Turn[];
  subjectId: string;
  onRestart: () => void;
  onExit: () => void;
}) {
  const [awarded, setAwarded] = useState<number[][]>(() =>
    questions.map((question) => question.rubric.map(() => 0)),
  );
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState<SubmitOutcome | 'sending' | null>(null);
  const corrections = useLocalValue(examCorrections);
  const sentId =
    sending !== null && sending !== 'sending' && sending.status === 'sent' ? sending.id : null;
  const entry = sentId ? corrections.find((candidate) => candidate.id === sentId) : undefined;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const saveSelfAssessment = () => {
    questions.forEach((question, i) => {
      const grade = gradeFromScore(rubricScore(question.rubric, awarded[i] ?? []));
      for (const conceptKey of question.conceptKeys) {
        void recordStudyAnswer({
          subjectId,
          conceptKey,
          questionId: question.key,
          source: 'interview',
          grade,
          language: 'en',
        });
      }
    });
    setSaved(true);
  };

  const sendToClaude = async () => {
    setSending('sending');
    setSending(
      await submitForCorrection((input, init) => fetch(input, init), {
        subjectId,
        kind: 'interview',
        items: questions.map((question, i) =>
          submissionItemFor(question, turns[i]?.answer ?? '', {
            followUpAnswer: turns[i]?.followUpAnswer ?? null,
          }),
        ),
      }),
    );
  };

  return (
    <section className="ef-ex" aria-labelledby="iv-end">
      <div className="ef-ex-bar">
        <button type="button" className="ef-link" onClick={onExit}>
          ← Esame
        </button>
      </div>
      <h2 id="iv-end" ref={headingRef} tabIndex={-1} className="ef-ex-question">
        Colloquio finito
      </h2>
      {questions.length === 0 ? (
        <>
          <p className="ef-rv-note">Nessuna risposta data.</p>
          <button type="button" className="ef-cta" onClick={onRestart}>
            Ricomincia
          </button>
        </>
      ) : (
        <>
          <div className="ef-section">
            <h2>Correzione di Claude</h2>
            <SendToClaude
              sending={sending}
              disabled={false}
              tooLong={false}
              onSend={() => {
                void sendToClaude();
              }}
            />
            {entry ? <CorrectionView entry={entry} /> : null}
          </div>
          {questions.map((question, i) => (
            <article key={question.key} className="ef-panel ef-cr-item" lang="en">
              <h3 className="ef-cr-q">{question.prompt}</h3>
              <p className="ef-hint" lang="it">
                Soluzione modello
              </p>
              <pre className="ef-ex-code">
                <code>{question.modelAnswer}</code>
              </pre>
              <ul className="ef-ex-rubric">
                {question.rubric.map((criterion, c) => (
                  <li key={criterion.criterion}>
                    <span>{criterion.criterion}</span>
                    <div
                      className="ef-seg"
                      role="group"
                      aria-label={`Points: ${criterion.criterion}`}
                    >
                      {Array.from({ length: criterion.points + 1 }, (_, value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={awarded[i]?.[c] === value}
                          disabled={saved}
                          onClick={() => {
                            setAwarded(
                              awarded.map((row, r) =>
                                r === i ? row.map((old, k) => (k === c ? value : old)) : row,
                              ),
                            );
                          }}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {saved ? (
            <p className="ef-fb" role="status">
              Autovalutazione salvata: il ripasso dei concetti è aggiornato.
            </p>
          ) : (
            <button type="button" className="ef-cta" onClick={saveSelfAssessment}>
              Salva l’autovalutazione
            </button>
          )}
          <button type="button" className="ef-link" onClick={onRestart}>
            Nuovo colloquio
          </button>
        </>
      )}
    </section>
  );
}
