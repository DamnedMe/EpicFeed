'use client';

import type { StoredQuestion } from '@epicfeed/assistant';
import { useEffect, useMemo, useState } from 'react';
import { readCachedFeed } from '../feed/feed-client';
import { AnswerText } from './answer-text';
import { deleteQuestion, loadQuestions } from './questions-client';

/** Data breve in italiano (es. «28 nov, 14:05»). */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * *Io › Le mie domande* (M6, ADR 0021, scelta 1): le domande messe in coda
 * per Claude Desktop, con la risposta quando arriva. La lezione si ricava
 * dalla copia della materia sul dispositivo.
 */
export function QuestionsList() {
  const [questions, setQuestions] = useState<StoredQuestion[] | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void loadQuestions().then((loaded) => {
      if (active) setQuestions(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const lessons = useMemo(() => {
    const titles = new Map<string, string>();
    const seen = new Set<string>();
    for (const question of questions ?? []) {
      if (seen.has(question.subjectId)) continue;
      seen.add(question.subjectId);
      const feed = readCachedFeed(question.subjectId);
      for (const chapter of feed?.chapters ?? []) {
        for (const lesson of chapter.lessons) titles.set(lesson.lessonId, lesson.title);
      }
    }
    return titles;
  }, [questions]);

  if (questions === undefined) return null;
  if (questions === null) {
    return <p className="text-sm text-muted">Non riesco a leggere le domande: riprova online.</p>;
  }
  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nessuna domanda. Nel feed tieni premuto su una scheda e scegli Chiedi a Claude.
      </p>
    );
  }
  return (
    <ul className="ef-panel">
      {questions.map((question) => (
        <li key={question.id} className="ef-question">
          <div className="ef-question-head">
            <span className={question.status === 'answered' ? 'answered' : ''}>
              {question.status === 'answered' ? 'Risposta di Claude' : 'In attesa di Claude'}
            </span>
            <span>{shortDate(question.createdAt)}</span>
          </div>
          <p className="ef-question-text">{question.question}</p>
          {lessons.get(question.lessonId) ? (
            <p className="ef-question-where">{lessons.get(question.lessonId)}</p>
          ) : null}
          {question.answer ? <AnswerText text={question.answer} /> : null}
          <button
            type="button"
            className="ef-question-delete"
            onClick={() => {
              void deleteQuestion(question.id).then((ok) => {
                if (ok) setQuestions((list) => list?.filter((item) => item.id !== question.id));
              });
            }}
          >
            Cancella
          </button>
        </li>
      ))}
    </ul>
  );
}
