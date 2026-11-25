'use client';

import { useMemo } from 'react';
import { readCachedFeed } from '../feed-client';
import { useHydrated } from '../local-state';
import { correctSubject } from './apply';
import { reportStatus, reportSummary } from './describe';
import { useCorrections, withdrawCorrection } from './use-corrections';

/**
 * *Le mie segnalazioni* (Io, M5): ogni correzione con il suo stato e
 * *Annulla*. Lo stato *da ricontrollare* si calcola sulla copia della materia
 * salvata sul dispositivo.
 */
export function ReportsList() {
  const hydrated = useHydrated();
  const { corrections, unsent } = useCorrections();
  const rows = useMemo(() => {
    const subjects = new Map<string, ReturnType<typeof readCachedFeed>>();
    for (const c of corrections) {
      if (!subjects.has(c.subjectId)) subjects.set(c.subjectId, readCachedFeed(c.subjectId));
    }
    const outcomes = new Map<string, ReturnType<typeof correctSubject>['outcomes']>();
    const lessons = new Map<string, string>();
    for (const [subjectId, feed] of subjects) {
      if (!feed) continue;
      outcomes.set(subjectId, correctSubject(feed, corrections).outcomes);
      for (const chapter of feed.chapters) {
        for (const lesson of chapter.lessons) lessons.set(lesson.lessonId, lesson.title);
      }
    }
    return [...corrections].reverse().map((correction) => {
      const draft = correction.correction;
      const lesson = draft.kind === 'term' ? null : (lessons.get(draft.lessonId) ?? null);
      return {
        correction,
        lesson,
        summary: reportSummary(correction),
        status: reportStatus(
          correction,
          unsent.has(correction.id),
          outcomes.get(correction.subjectId)?.get(correction.id),
        ),
      };
    });
  }, [corrections, unsent]);

  if (!hydrated) return null;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nessuna segnalazione. Nel feed tieni premuto su una scheda o una domanda e scegli Segnala
        errore.
      </p>
    );
  }
  return (
    <ul className="ef-panel">
      {rows.map(({ correction, lesson, summary, status }) => (
        <li key={correction.id} className="ef-report-row">
          <span className={`ef-report-status ${status.tone}`}>{status.label}</span>
          <span className="min-w-0">
            {lesson ? <small>{lesson} · </small> : null}
            {summary}
          </span>
          {status.detail ? <small>{status.detail}</small> : null}
          <button
            type="button"
            className="ef-link text-sm"
            onClick={() => {
              withdrawCorrection(correction.id);
            }}
          >
            Annulla
          </button>
        </li>
      ))}
    </ul>
  );
}
