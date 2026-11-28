'use client';

import { cleanQuestion } from '@epicfeed/assistant';
import Link from 'next/link';
import { useState } from 'react';
import type { FeedEntry } from '../feed/model';
import { randomId } from '../feed/report/sync';
import { queueQuestion } from './questions-client';

/**
 * *Chiedi a Claude* senza chiave (M6, ADR 0021, scelta 1): la domanda va in
 * coda per Claude Desktop e la risposta torna in *Io › Le mie domande*.
 */
export function QueueForm({
  subjectId,
  entry,
  language,
}: {
  subjectId: string;
  entry: FeedEntry;
  language: 'it' | 'en';
}) {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'queued'>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  const send = async () => {
    const question = cleanQuestion(draft);
    if (!question || state === 'sending') return;
    setState('sending');
    setProblem(null);
    const result = await queueQuestion({
      id: randomId(),
      subjectId,
      lessonId: entry.lessonId,
      itemType: entry.type,
      itemId: entry.type === 'card' ? entry.card.id : entry.quiz.id,
      question,
      language,
    });
    if (result.status === 'ok') {
      setState('queued');
    } else {
      setState('idle');
      setProblem(result.message);
    }
  };

  if (state === 'queued') {
    return (
      <div className="ef-ask-empty">
        <p className="ef-key-ok">Domanda in coda per Claude Desktop</p>
        <p>
          Sul PC, in Claude Desktop, chiedi «rispondi alle mie domande di EpicFeed». La risposta
          arriva in <em>Io › Le mie domande</em>.
        </p>
        <Link className="ef-report-ghost ef-ask-link" href="/profile/questions">
          Le mie domande
        </Link>
      </div>
    );
  }

  return (
    <div className="ef-ask-empty">
      <p>
        La domanda va in coda per Claude Desktop, con questa scheda. Sul PC chiedi «rispondi alle
        mie domande di EpicFeed»: la risposta arriva in <em>Io › Le mie domande</em>.
      </p>
      <form
        className="ef-ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="ef-report-field" htmlFor="queue-question">
          <small>La tua domanda</small>
          <textarea
            id="queue-question"
            rows={3}
            maxLength={1000}
            value={draft}
            placeholder="Perché a volte servono due rotazioni?"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          />
        </label>
        {problem ? (
          <p className="ef-ask-problem" role="alert">
            {problem}
          </p>
        ) : null}
        <button
          type="submit"
          className="ef-cta"
          disabled={state === 'sending' || cleanQuestion(draft) === null}
        >
          {state === 'sending' ? 'Salvo…' : 'Metti in coda per Claude Desktop'}
        </button>
      </form>
      <p className="ef-ask-note">
        Vuoi la risposta subito, anche sul telefono?{' '}
        <Link href="/profile/assistant">Aggiungi una chiave API</Link> (Gemini è gratuita).
      </p>
    </div>
  );
}
