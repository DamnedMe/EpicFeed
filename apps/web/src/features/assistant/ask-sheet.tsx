'use client';

import type { AssistantLanguage, ChatMessage, QuickAsk } from '@epicfeed/assistant';
import { PROVIDERS, QUICK_ASK_LABELS, cleanQuestion, quickAskText } from '@epicfeed/assistant';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeedEntry, SubjectFeed } from '../feed/model';
import { Sheet } from '../feed/sheets';
import { AnswerText } from './answer-text';
import { QueueForm } from './queue-form';
import { FAILURE_MESSAGES, askAssistant } from './assistant-client';
import { entryContext } from './context';
import { useAssistant } from './use-assistant';

const QUICK_ASKS: readonly QuickAsk[] = ['simpler', 'example', 'english', 'quizMe'];

/**
 * *Chiedi a Claude* dal feed (M6, ADR 0021): conversazione sulla scheda con
 * la chiave dello studente. La scheda, la lezione e i suoi concetti vanno al
 * fornitore con la domanda; la conversazione resta solo in questo foglio.
 * Senza chiave la domanda va in coda per Claude Desktop ({@link QueueForm}).
 */
export function AskSheet({
  feed,
  entry,
  language,
  onClose,
}: {
  feed: SubjectFeed;
  entry: FeedEntry;
  language: AssistantLanguage;
  onClose: () => void;
}) {
  const assistant = useAssistant();
  const context = useMemo(() => entryContext(feed, entry), [feed, entry]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, pending]);

  const settings = assistant.settings;
  const title = entry.type === 'card' ? entry.card.title[language] : entry.lessonTitle;

  const ask = async (text: string) => {
    const question = cleanQuestion(text);
    if (!question || !settings || pending) return;
    setProblem(null);
    setPending(true);
    setDraft('');
    const history = messages;
    setMessages([...history, { role: 'user', text: question }]);
    const result = await askAssistant({
      provider: settings.provider,
      key: settings.key,
      model: settings.model,
      context,
      language,
      history,
      question,
    });
    setPending(false);
    if (result.status === 'ok') {
      setMessages([
        ...history,
        { role: 'user', text: question },
        { role: 'assistant', text: result.text },
      ]);
      void assistant.countRequest();
    } else {
      // La domanda resta nel campo, per riprovare.
      setMessages(history);
      setDraft(question);
      setProblem(FAILURE_MESSAGES[result.failure]);
      if (result.failure !== 'invalid_key' && result.failure !== 'no_credit') {
        void assistant.countRequest();
      }
    }
  };

  return (
    <Sheet title="Chiedi a Claude" subtitle={`${entry.lessonTitle} · ${title}`} onClose={onClose}>
      {settings === undefined ? null : settings === null ? (
        <QueueForm subjectId={feed.subjectId} entry={entry} language={language} />
      ) : (
        <div className="ef-ask">
          <div className="ef-ask-log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="ef-ask-note">
                Fai una domanda su questa scheda: la risposta parte dalla scheda e dai concetti
                della lezione.
              </p>
            ) : null}
            {messages.map((message, i) =>
              message.role === 'user' ? (
                <p key={i} className="ef-ask-me">
                  {message.text}
                </p>
              ) : (
                <div key={i} className="ef-ask-reply">
                  <AnswerText text={message.text} />
                </div>
              ),
            )}
            {pending ? <p className="ef-ask-wait">Sto pensando…</p> : null}
            {problem ? (
              <p className="ef-ask-problem" role="alert">
                {problem}
              </p>
            ) : null}
            <div ref={endRef} />
          </div>
          <div className="ef-report-chips" aria-label="Domande rapide">
            {QUICK_ASKS.map((quick) => (
              <button
                key={quick}
                type="button"
                disabled={pending}
                onClick={() => {
                  void ask(quickAskText(quick, language));
                }}
              >
                {QUICK_ASK_LABELS[quick]}
              </button>
            ))}
          </div>
          <form
            className="ef-ask-form"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <label className="ef-report-field" htmlFor="ask-question">
              <small>La tua domanda</small>
              <textarea
                id="ask-question"
                rows={2}
                maxLength={1000}
                value={draft}
                placeholder="Perché a volte servono due rotazioni?"
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  // Invio manda, Maiuscolo+Invio va a capo.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask(draft);
                  }
                  event.stopPropagation();
                }}
              />
            </label>
            <button
              type="submit"
              className="ef-cta"
              disabled={pending || cleanQuestion(draft) === null}
            >
              Chiedi
            </button>
          </form>
          <p className="ef-ask-note">
            {PROVIDERS[settings.provider].label} · {settings.model} · con la scheda della lezione
          </p>
        </div>
      )}
    </Sheet>
  );
}
