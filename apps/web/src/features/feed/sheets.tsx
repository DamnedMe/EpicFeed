'use client';

import type { StudyLanguage } from '@epicfeed/feed';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';
import type { ChapterIndex, FeedEntry } from './model';
import { formatMinute } from './model';

/**
 * Foglio dal basso: si chiude toccando fuori, con Esc o con il pulsante.
 * Il fuoco entra nel foglio all'apertura, per tastiera e lettori di schermo.
 */
function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="ef-scrim" onClick={onClose}>
      <div
        ref={ref}
        className="ef-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="grab" />
        <h2>{title}</h2>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        {children}
        <button type="button" className="ef-action" onClick={onClose}>
          <Icon name="close" />
          Chiudi
        </button>
      </div>
    </div>
  );
}

const ORIGIN_LABEL = {
  summary: 'Riassunto del video',
  reading: 'Lettura',
  slides: 'Slide',
} as const;

/**
 * Foglio delle azioni (tieni premuto): Salva, Ascolta, lingua, Guarda sul
 * portale, Fonte, Chiedi (da M6) e i gesti.
 */
export function ActionSheet(props: {
  entry: FeedEntry;
  language: StudyLanguage;
  saved: boolean;
  speaking: boolean;
  onSave: () => void;
  onListen: () => void;
  onLanguage: () => void;
  onGestures: () => void;
  onClose: () => void;
}) {
  const { entry, language } = props;
  const isCard = entry.type === 'card';
  const title = isCard ? entry.card.title[language] : entry.quiz.question[language];
  const portal = isCard && entry.video ? entry.video : null;
  return (
    <Sheet
      title={title}
      subtitle={`${entry.chapterTitle} · ${entry.lessonTitle}`}
      onClose={props.onClose}
    >
      {isCard ? (
        <>
          <button
            type="button"
            className={`ef-action ${props.saved ? 'on' : ''}`}
            onClick={props.onSave}
          >
            <Icon name="bookmark" />
            <span>
              {props.saved ? 'Rimuovi dai salvati' : 'Salva'}
              <small>Anche con un doppio tocco sulla scheda</small>
            </span>
          </button>
          <button type="button" className="ef-action" onClick={props.onListen}>
            <Icon name={props.speaking ? 'stop' : 'listen'} />
            <span>
              {props.speaking ? 'Ferma la lettura' : 'Ascolta'}
              <small>Lettura ad alta voce con la voce del dispositivo</small>
            </span>
          </button>
        </>
      ) : null}
      <button type="button" className="ef-action" onClick={props.onLanguage}>
        <Icon name="language" />
        {language === 'it' ? 'Leggi in inglese' : 'Leggi in italiano'}
      </button>
      <a
        className="ef-action"
        href={portal ? portal.portalUrl : entry.lessonPortalUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="external" />
        <span>
          Guarda sul portale
          <small>
            {portal
              ? `${portal.title}: cerca il minuto ${formatMinute(portal.startMs)} nel player`
              : 'Apre la lezione sul portale Epicode'}
          </small>
        </span>
      </a>
      {isCard && entry.source ? (
        <a
          className="ef-action"
          href={entry.source.portalUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="source" />
          <span>
            Fonte
            <small>
              {ORIGIN_LABEL[entry.card.origin]}: {entry.source.title}
            </small>
          </span>
        </a>
      ) : null}
      <button type="button" className="ef-action" disabled>
        <Icon name="ask" />
        <span>
          Chiedi a Claude
          <small>In arrivo con l&apos;assistente di studio</small>
        </span>
      </button>
      <button type="button" className="ef-action" onClick={props.onGestures}>
        <Icon name="hand" />
        Rivedi i gesti
      </button>
    </Sheet>
  );
}

/** Elenco *Capitolo*: salta a un capitolo o a una lezione della materia. */
export function ChapterSheet({
  subjectTitle,
  chapters,
  currentLessonId,
  onJump,
  onClose,
}: {
  subjectTitle: string;
  chapters: readonly ChapterIndex[];
  currentLessonId: string | null;
  onJump: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={subjectTitle} subtitle="Salta a un capitolo o a una lezione" onClose={onClose}>
      {chapters.map((chapter) => (
        <section key={chapter.title}>
          <h3 className="ef-chapter">{chapter.title}</h3>
          {chapter.lessons.map((lesson) => (
            <button
              key={lesson.lessonId}
              type="button"
              className={`ef-lesson ${lesson.lessonId === currentLessonId ? 'current' : ''}`}
              disabled={lesson.start === null}
              aria-current={lesson.lessonId === currentLessonId ? 'true' : undefined}
              onClick={() => {
                if (lesson.start !== null) onJump(lesson.start);
              }}
            >
              <span>{lesson.title}</span>
              <small>{lesson.start === null ? 'da generare' : `${lesson.cards} schede`}</small>
            </button>
          ))}
        </section>
      ))}
    </Sheet>
  );
}
