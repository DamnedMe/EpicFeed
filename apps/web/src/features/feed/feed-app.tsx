'use client';

import type { StudyLanguage } from '@epicfeed/feed';
import { answerPoints, autoAdvanceMs, beatText, POINTS, SESSION_MS, storyOf } from '@epicfeed/feed';
import { gradeFromAnswer } from '@epicfeed/review';
import { useRouter } from 'next/navigation';
import * as z from 'zod';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BottomNav } from '@/components/bottom-nav';
import { recordStudyAnswer } from '@/features/review/record';
import type { CardState } from './card-slide';
import { CardSlide } from './card-slide';
import { SPEECH_LANG } from './copy';
import { loadFeed, preferredSubjectId, readCachedFeed, rememberFeedCopy } from './feed-client';
import type { Gesture } from './gestures';
import { SavedMark } from './icons';
import { preferences, savedCards, stats, useLocalValue } from './local-state';
import type { CardEntry, FeedEntry, SubjectFeed } from './model';
import { buildEntries, chapterIndex, resumeIndex } from './model';
import type { SessionSummary } from './overlays';
import { GestureIntro, SessionEnd } from './overlays';
import type { QuizAnswer } from './quiz-slide';
import { QuizSlide } from './quiz-slide';
import { ActionSheet, ChapterSheet } from './sheets';
import { readValue, STORAGE_KEYS, writeValue } from './storage';
import { useProgressSync } from '@/features/review/sync/engine';
import type { LoadState } from './feed-fallback';
import { FeedFallback } from './feed-fallback';
import { FeedHud } from './feed-hud';
import type { Session } from './session';
import { newSession } from './session';
import { useKeyboard } from './use-keyboard';
import { useSpeech } from './use-speech';

/** Quante schede si disegnano intorno a quella visibile: le altre sono segnaposto vuoti. */
const WINDOW = 2;
const RING_LENGTH = 81.7;
const INITIAL_CARD: CardState = { beat: 0, blank: false };

/** Parametri dell'indirizzo: scheda da aprire (da *Salvati*), materia, gesti da rivedere. */
function readRequest() {
  const params = new URLSearchParams(window.location.search);
  const request = {
    card: params.get('card'),
    subject: params.get('subject'),
    gestures: params.get('gesti') === '1',
  };
  if (params.size > 0) window.history.replaceState(null, '', window.location.pathname);
  return request;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Feed di studio (M3, ADR 0015): la materia in ordine, una scheda per
 * schermata raccontata a battute, con domande, punti, sessioni da 5 minuti e
 * gesti al posto dei pulsanti. Tutto lo stato di studio resta sul dispositivo;
 * i progressi del ripasso si sincronizzano cifrati (ADR 0018).
 *
 * @param props.account - Utente della sessione (per la sincronizzazione).
 * @param props.preview - Prima lezione disegnata sul server alla prima
 * apertura su questo dispositivo (`feedPreview`), finché non arriva la materia.
 */
export function FeedApp({
  account,
  preview = null,
}: {
  account: string;
  preview?: SubjectFeed | null;
}) {
  useProgressSync(account);
  const router = useRouter();
  const { speaking, speak, stopSpeaking } = useSpeech();
  const prefs = useLocalValue(preferences);
  const saved = useLocalValue(savedCards);
  const [load, setLoad] = useState<LoadState>(() =>
    preview
      ? { status: 'ready', subjects: [], feed: preview, offline: false }
      : { status: 'loading' },
  );
  const [current, setCurrent] = useState(0);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [languages, setLanguages] = useState<Record<string, StudyLanguage>>({});
  const [sheet, setSheet] = useState<'actions' | 'chapters' | null>(null);
  const [forcedIntro, setForcedIntro] = useState(false);
  const [session, setSession] = useState<Session>(() => newSession(0));
  const [ended, setEnded] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [toast, setToast] = useState<{ id: number; label: string } | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const feedRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(0);
  const restoredFor = useRef<string | null>(null);
  const sessionStarted = useRef(false);
  const scrollFrame = useRef(0);
  /** Contatore per riavviare le animazioni di punti e salvataggio. */
  const nextId = useRef(0);
  /** Anteprima del server: vale solo per il primo caricamento. */
  const previewRef = useRef(preview);

  /**
   * Apre una materia sulla scheda giusta: quella chiesta, altrimenti l'ultima
   * vista (`position`). La posizione si salva subito, così anche una scheda
   * aperta da *Salvati* resta il punto da cui riprendere.
   */
  const openFeed = useCallback((subjectFeed: SubjectFeed, requestedCard: string | null) => {
    const positionKey = STORAGE_KEYS.position(subjectFeed.subjectId);
    const position = requestedCard ?? readValue(positionKey, z.string(), null as string | null);
    const list = buildEntries(subjectFeed);
    const index = resumeIndex(list, position);
    currentRef.current = index;
    setCurrent(index);
    if (list[index]) writeValue(positionKey, list[index].key);
    // La sessione da 5 minuti parte con la prima materia mostrata, non a ogni aggiornamento.
    if (!sessionStarted.current) {
      sessionStarted.current = true;
      setSession(newSession(Date.now()));
    }
  }, []);

  // Caricamento: prima la copia sul dispositivo (subito, senza rete), poi la
  // risposta del server con l'ETag; se la materia è cambiata la si sostituisce
  // restando sulla scheda che si sta guardando.
  useEffect(() => {
    let alive = true;
    let shown: SubjectFeed | null = null;
    const request = readRequest();
    void Promise.resolve().then(() => {
      if (!alive) return;
      if (request.gestures) setForcedIntro(true);
      const subjectId = preferredSubjectId(undefined, request.subject);
      const cached = subjectId ? readCachedFeed(subjectId) : null;
      if (!cached) {
        // Prima apertura: si studia l'anteprima del server finché arriva la materia intera.
        const first = previewRef.current;
        previewRef.current = null;
        if (first) {
          shown = first;
          openFeed(first, request.card);
        }
        return;
      }
      rememberFeedCopy();
      shown = cached;
      openFeed(cached, request.card);
      setLoad({ status: 'ready', subjects: [], feed: cached, offline: false });
    });
    void loadFeed((input, init) => fetch(input, init), undefined, request.subject).then(
      (result) => {
        if (!alive) return;
        if (result.status === 'unauthorized') {
          window.location.assign('/login');
          return;
        }
        if (result.status === 'error' && shown) {
          // Server irraggiungibile: si continua sulla copia, con l'avviso.
          setLoad((previous) =>
            previous.status === 'ready' ? { ...previous, offline: true } : result,
          );
          return;
        }
        if (result.status === 'ready') {
          const same =
            shown?.subjectId === result.feed.subjectId && shown.version === result.feed.version;
          if (same && shown) {
            // Stessa materia: si tiene l'oggetto già mostrato (niente ricalcoli né salti).
            setLoad({ ...result, feed: shown });
            return;
          }
          // Materia nuova o aggiornata: la posizione salvata è la scheda che si stava guardando.
          openFeed(result.feed, shown ? null : request.card);
        }
        setLoad(result);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt, openFeed]);

  const feed = load.status === 'ready' ? load.feed : null;
  const entries = useMemo(() => (feed ? buildEntries(feed) : []), [feed]);
  const chapters = useMemo(() => (feed ? chapterIndex(feed, entries) : []), [feed, entries]);
  const savedKeys = useMemo(() => new Set(saved.map((card) => card.key)), [saved]);
  const entry: FeedEntry | undefined = entries[current];
  const languageOf = useCallback(
    (item: FeedEntry | undefined): StudyLanguage => {
      if (!item) return prefs.language;
      return languages[item.key] ?? (item.type === 'quiz' ? prefs.quizLanguage : prefs.language);
    },
    [languages, prefs.language, prefs.quizLanguage],
  );

  // Riporta lo scroll alla posizione salvata quando arriva una materia.
  useLayoutEffect(() => {
    const element = feedRef.current;
    if (!feed || !element || restoredFor.current === feed.version) return;
    restoredFor.current = feed.version;
    element.scrollTop = currentRef.current * element.clientHeight;
  }, [feed]);

  // Anello dei 5 minuti: aggiornato dal client ogni pochi secondi.
  useEffect(() => {
    if (!feed) return;
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - session.startedAt);
      const ratio = Math.min(1, elapsed / SESSION_MS);
      ringRef.current?.style.setProperty('--ef-ring', String(RING_LENGTH * (1 - ratio)));
      setMinutes(Math.floor(elapsed / 60000));
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      window.clearInterval(id);
    };
  }, [feed, session.startedAt]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const element = feedRef.current;
      if (!element || index < 0 || index >= entries.length) return;
      const reduced = prefersReducedMotion() || !prefs.animations;
      element.scrollTo({
        top: index * element.clientHeight,
        behavior: reduced ? 'auto' : 'smooth',
      });
    },
    [entries.length, prefs.animations],
  );

  const onScroll = () => {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const element = feedRef.current;
      if (!element || !feed) return;
      const index = Math.round(element.scrollTop / Math.max(1, element.clientHeight));
      if (index === currentRef.current || !entries[index]) return;
      currentRef.current = index;
      setCurrent(index);
      writeValue(STORAGE_KEYS.position(feed.subjectId), entries[index].key);
      stopSpeaking();
      setSession((previous) => ({ ...previous, seen: previous.seen + 1 }));
      if (!ended && Date.now() - session.startedAt >= SESSION_MS) {
        // Sessione completata: si conta qui, anche se poi si chiude l'app senza scegliere.
        setEnded(true);
        stats.set((previous) => ({ ...previous, sessions: previous.sessions + 1 }));
      }
    });
  };

  const award = (points: number) => {
    setSession((previous) => ({ ...previous, points: previous.points + points }));
    stats.set((previous) => ({ ...previous, points: previous.points + points }));
    if (!prefs.points) return;
    nextId.current += 1;
    setToast({ id: nextId.current, label: `+${points}` });
    if (prefs.vibration) {
      try {
        if ('vibrate' in navigator) navigator.vibrate(30);
      } catch {
        // Vibrazione non supportata.
      }
    }
  };

  const updateCard = (key: string, next: CardState) => {
    setCards((previous) => ({ ...previous, [key]: next }));
  };

  const save = (item: CardEntry, toggle: boolean) => {
    if (!feed) return;
    const isSaved = savedKeys.has(item.key);
    if (isSaved && toggle) {
      savedCards.set((list) => list.filter((card) => card.key !== item.key));
      return;
    }
    // Il doppio tocco salva soltanto, non toglie: come un "mi piace".
    if (!isSaved) {
      savedCards.set((list) => [
        {
          key: item.key,
          subjectId: feed.subjectId,
          lessonTitle: item.lessonTitle,
          title: { it: item.card.title.it, en: item.card.title.en },
          savedAt: new Date().toISOString(),
        },
        ...list,
      ]);
    }
    if (!toggle) {
      nextId.current += 1;
      setFlash(nextId.current);
    }
  };

  /** Battuta dopo o prima; oltre i bordi passa alla scheda vicina. */
  const advance = (index: number, direction: 1 | -1, byUser: boolean) => {
    const item = entries[index];
    if (item?.type !== 'card') return;
    const story = storyOf(item.card, languageOf(item));
    const state = cards[item.key] ?? INITIAL_CARD;
    const beatIndex = Math.min(state.beat, story.beats.length - 1);
    if (direction > 0 && story.beats[beatIndex]?.kind === 'key' && story.blank && !state.blank) {
      updateCard(item.key, { beat: beatIndex, blank: true });
      if (byUser) award(POINTS.blank);
      return;
    }
    const next = beatIndex + direction;
    if (next < 0) scrollToIndex(index - 1);
    else if (next >= story.beats.length) scrollToIndex(index + 1);
    else updateCard(item.key, { ...state, beat: next });
  };

  const onGesture = (index: number, gesture: Gesture) => {
    const item = entries[index];
    if (item?.type !== 'card' || sheet || ended) return;
    if (gesture === 'next') advance(index, 1, true);
    else if (gesture === 'previous') advance(index, -1, true);
    else if (gesture === 'save') save(item, false);
    else setSheet('actions');
  };

  const onAnswer = (item: FeedEntry, answer: QuizAnswer, correct: boolean) => {
    if (answers[item.key] !== undefined) return;
    setAnswers((previous) => ({ ...previous, [item.key]: answer }));
    const streak = correct ? session.streak + 1 : 0;
    setSession((previous) => ({
      ...previous,
      answered: previous.answered + 1,
      right: previous.right + (correct ? 1 : 0),
      streak,
      bestStreak: Math.max(previous.bestStreak, streak),
    }));
    stats.set((previous) => ({ ...previous, bestStreak: Math.max(previous.bestStreak, streak) }));
    if (correct) award(answerPoints(streak));
    // Ogni risposta del feed entra nel ripasso del suo concetto (M4, ADR 0017).
    if (item.type === 'quiz' && feed) {
      void recordStudyAnswer({
        subjectId: feed.subjectId,
        conceptKey: item.quiz.conceptKey,
        questionId: item.key,
        source: 'feed',
        grade: gradeFromAnswer(correct),
        language: languageOf(item),
      });
    }
  };

  const listen = () => {
    if (entry?.type !== 'card') return;
    if (speaking === entry.key) {
      stopSpeaking();
      return;
    }
    const language = languageOf(entry);
    const story = storyOf(entry.card, language);
    speak(
      entry.key,
      story.beats
        .map((beat) => beatText(story, beat))
        .filter(Boolean)
        .join('. '),
      SPEECH_LANG[language],
    );
  };

  const toggleLanguage = () => {
    if (!entry) return;
    setLanguages((previous) => ({
      ...previous,
      [entry.key]: languageOf(entry) === 'it' ? 'en' : 'it',
    }));
    stopSpeaking();
  };

  const finishSession = (again: boolean) => {
    setEnded(false);
    setSession(newSession(Date.now()));
    if (!again) router.push('/profile');
  };

  // Tastiera: le stesse azioni dei gesti.
  useKeyboard((event) => {
    if (sheet || ended || !entry) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, button, a')) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowright' || key === ' ') advance(current, 1, true);
    else if (key === 'arrowleft') advance(current, -1, true);
    else if (key === 'arrowdown' || key === 'pagedown' || key === 'j') scrollToIndex(current + 1);
    else if (key === 'arrowup' || key === 'pageup' || key === 'k') scrollToIndex(current - 1);
    else if (key === 's' && entry.type === 'card') save(entry, true);
    else if (key === 'a') setSheet('actions');
    else return;
    event.preventDefault();
  });

  // Avanzamento automatico alla velocità di lettura (facoltativo, da Io).
  const autoStory = entry?.type === 'card' ? storyOf(entry.card, languageOf(entry)) : null;
  const autoState = entry ? (cards[entry.key] ?? INITIAL_CARD) : INITIAL_CARD;
  const autoBeat = autoStory?.beats[Math.min(autoState.beat, autoStory.beats.length - 1)];
  const autoMs =
    prefs.autoAdvance && autoStory && autoBeat && !sheet && !ended && !speaking
      ? autoAdvanceMs(beatText(autoStory, autoBeat))
      : 0;
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });
  useEffect(() => {
    if (autoMs === 0) return;
    const id = window.setTimeout(() => {
      advanceRef.current(current, 1, false);
    }, autoMs);
    return () => {
      window.clearTimeout(id);
    };
  }, [autoMs, current, autoState.beat, autoState.blank]);

  const showIntro = forcedIntro || (load.status === 'ready' && !prefs.introSeen);
  const summary: SessionSummary = {
    points: session.points,
    minutes: Math.max(1, minutes),
    cards: session.seen,
    right: session.right,
    answered: session.answered,
    bestStreak: session.bestStreak,
  };

  if (load.status !== 'ready' || !feed) {
    return (
      <div className="ef-app">
        <FeedFallback
          load={load}
          onRetry={() => {
            setAttempt((value) => value + 1);
          }}
        />
        <BottomNav active="feed" />
      </div>
    );
  }

  return (
    <div className="ef-app" data-motion={prefs.animations ? undefined : 'off'}>
      <FeedHud
        title={entry ? `${entry.chapterTitle} · ${entry.lessonTitle}` : feed.title}
        showPoints={prefs.points}
        points={session.points}
        streak={session.streak}
        minutes={minutes}
        ringRef={ringRef}
        language={languageOf(entry)}
        onChapters={() => {
          setSheet('chapters');
        }}
        onLanguage={toggleLanguage}
      />
      {load.offline ? (
        <p className="ef-hint px-4 pb-1">Sei offline: studi la copia salvata.</p>
      ) : null}

      <main
        ref={feedRef}
        className="ef-feed"
        onScroll={onScroll}
        aria-label={`Feed di ${feed.title}`}
      >
        {entries.map((item, index) => {
          const near = Math.abs(index - current) <= WINDOW;
          const language = languageOf(item);
          return (
            <section
              key={item.key}
              className="ef-slide"
              inert={index !== current}
              aria-roledescription="scheda"
              aria-label={`${index + 1} di ${entries.length}`}
            >
              {near && item.type === 'card' ? (
                <CardSlide
                  entry={item}
                  story={storyOf(item.card, language)}
                  state={cards[item.key] ?? INITIAL_CARD}
                  saved={savedKeys.has(item.key)}
                  autoMs={index === current ? autoMs : 0}
                  onGesture={(gesture) => {
                    onGesture(index, gesture);
                  }}
                  onRevealBlank={() => {
                    advance(index, 1, true);
                  }}
                />
              ) : null}
              {near && item.type === 'quiz' ? (
                <QuizSlide
                  entry={item}
                  language={language}
                  answer={answers[item.key]}
                  showPoints={prefs.points}
                  onAnswer={(answer, correct) => {
                    onAnswer(item, answer, correct);
                  }}
                />
              ) : null}
            </section>
          );
        })}
      </main>

      <BottomNav active="feed" />

      {toast ? (
        <div
          key={toast.id}
          className="ef-toast"
          aria-hidden="true"
          onAnimationEnd={() => {
            setToast(null);
          }}
        >
          {toast.label}
        </div>
      ) : null}
      {flash ? (
        <div
          key={flash}
          className="ef-saved-flash"
          onAnimationEnd={() => {
            setFlash(null);
          }}
        >
          <SavedMark />
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {flash ? 'Scheda salvata' : ''}
      </p>

      {sheet === 'actions' && entry ? (
        <ActionSheet
          entry={entry}
          language={languageOf(entry)}
          saved={savedKeys.has(entry.key)}
          speaking={speaking === entry.key}
          onSave={() => {
            if (entry.type === 'card') save(entry, true);
          }}
          onListen={() => {
            listen();
            setSheet(null);
          }}
          onLanguage={() => {
            toggleLanguage();
            setSheet(null);
          }}
          onGestures={() => {
            setSheet(null);
            setForcedIntro(true);
          }}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === 'chapters' ? (
        <ChapterSheet
          subjectTitle={feed.title}
          chapters={chapters}
          currentLessonId={entry?.lessonId ?? null}
          onJump={(index) => {
            setSheet(null);
            // Il salto è lungo: niente animazione, si arriva subito.
            const element = feedRef.current;
            if (element) element.scrollTop = index * element.clientHeight;
          }}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
      {ended ? (
        <SessionEnd
          summary={summary}
          showPoints={prefs.points}
          onAgain={() => {
            finishSession(true);
          }}
          onClose={() => {
            finishSession(false);
          }}
        />
      ) : null}
      {showIntro ? (
        <GestureIntro
          onDone={() => {
            setForcedIntro(false);
            preferences.set((previous) => ({ ...previous, introSeen: true }));
          }}
        />
      ) : null}
    </div>
  );
}
