'use client';

import type {
  AnswerFix,
  CorrectionDraft,
  CorrectionReason,
  StoryBeat,
  StudyLanguage,
} from '@epicfeed/feed';
import { countTermUsage } from '@epicfeed/feed';
import { useMemo, useState } from 'react';
import type { FeedEntry, SubjectFeed } from '../model';
import { Sheet } from '../sheets';
import type { TermChange } from './fragments';
import { editFor, fragmentForBeat, fragmentsOf, termChange } from './fragments';

/** Motivi rapidi, nell'ordine del prototipo approvato. */
const REASONS: { value: CorrectionReason; label: string }[] = [
  { value: 'content', label: 'Contenuto sbagliato' },
  { value: 'translation', label: 'Traduzione' },
  { value: 'code', label: 'Codice' },
  { value: 'unclear', label: 'Poco chiaro' },
];

/** Correzioni pronte da salvare, con il messaggio per lo studente. */
export interface ReportResult {
  readonly drafts: CorrectionDraft[];
  readonly message: string;
  /** Risposta giusta cambiata (per il ripasso). */
  readonly answerFix: AnswerFix | null;
}

interface Props {
  readonly entry: FeedEntry;
  readonly language: StudyLanguage;
  /** Battuta mostrata, `null` per le domande. */
  readonly beat: StoryBeat | null;
  /** Materia come la si vede (già corretta), per contare un termine ripetuto. */
  readonly subject: SubjectFeed;
  readonly onSave: (result: ReportResult) => void;
  readonly onClose: () => void;
}

/** Elemento come lo vede lo studente: contesto per Claude (ADR 0020). */
function snapshotOf(entry: FeedEntry): Record<string, unknown> {
  if (entry.type === 'quiz') return { ...entry.quiz };
  const card: Record<string, unknown> = { ...entry.card };
  delete card.video;
  return card;
}

/**
 * Foglio *Segnala errore* (M5, ADR 0020, scelta 1): la frase della battuta
 * mostrata è già nel campo, le frecce scelgono un'altra frase. Per le domande
 * si può indicare anche la risposta giusta. Se la correzione cambia un solo
 * termine che compare in altre schede della materia, chiede se correggerlo
 * ovunque (scelta 3).
 */
export function ReportSheet({ entry, language, beat, subject, onSave, onClose }: Props) {
  const fragments = useMemo(() => fragmentsOf(entry, language), [entry, language]);
  const [position, setPosition] = useState(() => fragmentForBeat(fragments, beat));
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<CorrectionReason>('content');
  const quiz = entry.type === 'quiz' ? entry.quiz : null;
  const currentAnswer = quiz
    ? quiz.kind === 'multiple_choice'
      ? quiz.correctIndex
      : Number(quiz.answer)
    : null;
  const [answer, setAnswer] = useState<number | null>(currentAnswer);
  const [term, setTerm] = useState<(TermChange & { items: number; lessons: string[] }) | null>(
    null,
  );

  const fragment = fragments[Math.min(position, fragments.length - 1)] ?? fragments[0];
  if (!fragment) return null;
  const value = texts[position] ?? fragment.text;
  const edits = fragments.flatMap((f, i) => {
    const text = texts[i];
    const edit = text === undefined ? null : editFor(f, text, language);
    return edit ? [edit] : [];
  });
  const chosen = answer !== null && answer !== currentAnswer ? answer : null;
  const answerChanged = chosen !== null;
  const canSave = edits.length > 0 || answerChanged;
  const itemType = entry.type;
  const itemId = entry.type === 'card' ? entry.card.id : entry.quiz.id;
  const snapshot = snapshotOf(entry);

  const answerFix = (): AnswerFix | null => {
    if (!quiz || chosen === null) return null;
    if (quiz.kind === 'true_false') return { kind: 'true_false', answer: chosen === 1 };
    return {
      kind: 'multiple_choice',
      correctIndex: chosen,
      option: { it: quiz.options.it[chosen] ?? '', en: quiz.options.en[chosen] ?? '' },
    };
  };

  const finish = (everywhere: boolean) => {
    const drafts: CorrectionDraft[] = [];
    const fix = answerFix();
    if (quiz && fix) {
      drafts.push({
        kind: 'answer',
        lessonId: entry.lessonId,
        itemId,
        fix,
        question: { it: quiz.question.it, en: quiz.question.en },
        reason,
        snapshot,
      });
    }
    if (everywhere && term) {
      drafts.push({ kind: 'term', from: term.from, to: term.to, reason });
    } else if (edits.length > 0) {
      // Al massimo due interventi per correzione: se ne servono di più, più correzioni.
      for (let i = 0; i < edits.length; i += 2) {
        drafts.push({
          kind: 'text',
          lessonId: entry.lessonId,
          itemType,
          itemId,
          edits: edits.slice(i, i + 2),
          reason,
          snapshot,
        });
      }
    }
    const onlyCode = edits.every((edit) => edit.field === 'code');
    const message =
      everywhere && term
        ? `Corretto «${term.from}» in ${term.items} ${term.items === 1 ? 'scheda' : 'schede'}`
        : edits.length > 0 && !onlyCode
          ? `Correzione salvata. L'${language === 'it' ? 'inglese' : 'italiano'} lo allinea Claude alla prossima sessione su Claude Desktop.`
          : 'Correzione salvata';
    onSave({ drafts, message, answerFix: fix });
  };

  const save = () => {
    // Un solo termine cambiato che compare anche altrove: si chiede prima.
    const [single] = edits;
    const change =
      edits.length === 1 && single ? termChange(single.original, single.corrected) : null;
    if (change && single?.field !== 'code') {
      const usage = countTermUsage(
        subject.chapters.flatMap((chapter) =>
          chapter.lessons.flatMap((lesson) =>
            lesson.feed ? [{ title: lesson.title, feed: lesson.feed }] : [],
          ),
        ),
        change.from,
      );
      if (usage.items > 1) {
        setTerm({ ...change, items: usage.items, lessons: [...usage.lessonTitles] });
        return;
      }
    }
    finish(false);
  };

  const regenerate = () => {
    onSave({
      drafts: [
        { kind: 'regenerate', lessonId: entry.lessonId, itemType, itemId, reason, snapshot },
      ],
      message:
        'Segnalata: Claude la riscrive dai riassunti alla prossima sessione su Claude Desktop.',
      answerFix: null,
    });
  };

  if (term) {
    const others = term.lessons.slice(0, 2).join(', ');
    const more = term.lessons.length > 2 ? ` e altre ${term.lessons.length - 2} lezioni` : '';
    return (
      <Sheet
        title={`«${term.from}» compare in altre ${term.items - 1} ${term.items - 1 === 1 ? 'scheda' : 'schede'}`}
        subtitle={`${others}${more}`}
        onClose={onClose}
      >
        <div className="ef-report">
          <p className="ef-report-field">
            <small>Diventa</small>
            <span>
              <s>{term.from}</s> → <b>{term.to}</b>
            </span>
          </p>
          <button
            type="button"
            className="ef-cta"
            onClick={() => {
              finish(true);
            }}
          >
            Correggi tutte e {term.items}
          </button>
          <button
            type="button"
            className="ef-report-ghost"
            onClick={() => {
              finish(false);
            }}
          >
            Solo questa scheda
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={quiz ? 'Segnala la domanda' : 'Segnala errore'}
      subtitle="La frase che stavi leggendo, già pronta da correggere"
      onClose={onClose}
    >
      <div className="ef-report">
        <div className="ef-report-nav">
          <button
            type="button"
            aria-label="Frase precedente"
            disabled={position === 0}
            onClick={() => {
              setPosition((p) => Math.max(0, p - 1));
            }}
          >
            ‹
          </button>
          <span aria-live="polite">
            Frase {position + 1} di {fragments.length} · {fragment.label}
          </span>
          <button
            type="button"
            aria-label="Frase successiva"
            disabled={position >= fragments.length - 1}
            onClick={() => {
              setPosition((p) => Math.min(fragments.length - 1, p + 1));
            }}
          >
            ›
          </button>
        </div>
        <label className="ef-report-field" htmlFor="report-text">
          <small>Correzione</small>
          <textarea
            id="report-text"
            className={fragment.field === 'code' ? 'code' : undefined}
            value={value}
            rows={fragment.field === 'code' ? 2 : 3}
            maxLength={2000}
            spellCheck={fragment.field !== 'code'}
            onChange={(event) => {
              const next = event.target.value;
              setTexts((previous) => ({ ...previous, [position]: next }));
            }}
          />
        </label>
        {quiz ? (
          <fieldset className="ef-report-answers">
            <legend>Qual è la risposta giusta?</legend>
            {(quiz.kind === 'multiple_choice'
              ? quiz.options[language]
              : language === 'it'
                ? ['Falso', 'Vero']
                : ['False', 'True']
            ).map((option, index) => (
              <button
                key={option + String(index)}
                type="button"
                aria-pressed={answer === index}
                className={answer === index ? 'now' : undefined}
                onClick={() => {
                  setAnswer(index);
                }}
              >
                <span>{option}</span>
                {index === currentAnswer ? <small>indicata</small> : null}
                {answer === index && index !== currentAnswer ? <small>✓ giusta</small> : null}
              </button>
            ))}
          </fieldset>
        ) : null}
        <div className="ef-report-chips" role="radiogroup" aria-label="Motivo">
          {REASONS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={reason === item.value}
              onClick={() => {
                setReason(item.value);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="ef-cta" disabled={!canSave} onClick={save}>
          Salva correzione
        </button>
        <button type="button" className="ef-report-ghost" onClick={regenerate}>
          Non so la correzione: rifalla da capo
        </button>
      </div>
    </Sheet>
  );
}
