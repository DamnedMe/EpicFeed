import type { ImportLessonRequest } from '@study-feed/contracts';
import type { Activity, ActivityChild, Course } from './directus';
import { academicYear } from './portal';

/** Lezione pronta da inviare, senza sottotitoli (si aggiungono dopo). */
export interface LessonDraft {
  request: ImportLessonRequest;
  /** Parti video da cui leggere i sottotitoli: id della parte e id Vimeo. */
  videos: { partEpicodeId: string; videoId: string }[];
  /** Parti saltate (slide, quiz…), solo per l'anteprima. */
  skipped: number;
}

const VIMEO_ID = /player\.vimeo\.com\/video\/(\d{1,20})/;

// Gli ordinamenti di Directus possono mancare; i quiz hanno sort 9999.
const position = (sort: number | null | undefined) => Math.max(0, Math.min(sort ?? 0, 100_000));

/**
 * Trasforma attività e corso del portale nel payload di import.
 *
 * Corrispondenza: istituto → corso di studi, anno accademico → edizione,
 * corso → materia, modulo → capitolo, attività → lezione, video Vimeo e
 * riassunto markdown → parti. Slide Google Docs, quiz, articoli e questionari
 * restano fuori (le slide non hanno testo, i quiz sono materiale di verifica).
 * Le parti nascoste dal portale non si importano.
 *
 * @param activity - Attività letta da Directus.
 * @param course - Corso letto da Directus.
 * @returns La bozza della lezione.
 */
export function buildLessonDraft(activity: Activity, course: Course): LessonDraft {
  const module = activity.parent;
  const unitSort = position(module.parent?.sort);
  const parts: ImportLessonRequest['parts'] = [];
  const videos: LessonDraft['videos'] = [];
  let skipped = 0;

  for (const child of activity.children) {
    const part = toPart(child);
    if (!part) {
      skipped += 1;
      continue;
    }
    parts.push(part);
    if (part.videoId) videos.push({ partEpicodeId: part.epicodeId, videoId: part.videoId });
  }

  return {
    request: {
      path: {
        studyProgram: course.tenant
          ? { epicodeId: course.tenant.id, title: clean(course.tenant.name) }
          : { epicodeId: 'epicode', title: 'Epicode' },
        edition: { label: academicYear(course.starts_at) },
        subject: { epicodeId: course.id, title: clean(course.title), position: 0 },
        // Un corso ha più unità con moduli numerati da 0: unità e modulo
        // insieme danno l'ordine globale dei capitoli.
        chapter: {
          epicodeId: module.id,
          title: clean(module.title),
          position: unitSort * 1000 + position(module.sort),
        },
        lesson: {
          epicodeId: activity.id,
          title: clean(activity.title),
          position: position(activity.sort),
        },
      },
      parts,
    },
    videos,
    skipped,
  };
}

function toPart(child: ActivityChild): ImportLessonRequest['parts'][number] | null {
  if (child.visibility?.hidden) return null;
  const title = clean(child.title ?? '') || 'Senza titolo';
  const base = { epicodeId: child.id, title, position: position(child.sort) };

  if (child.type === 'embed' && child.embed_type === 'vimeo') {
    const videoId = VIMEO_ID.exec(child.url ?? '')?.[1];
    const it = child.summary?.it?.trim() ?? '';
    const en = child.summary?.en?.trim() ?? '';
    return {
      ...base,
      kind: 'video',
      ...(videoId ? { videoId } : {}),
      content: { kind: 'video', summaries: { ...(it ? { it } : {}), ...(en ? { en } : {}) } },
    };
  }
  if (child.type === 'markdown' && child.markdown?.trim()) {
    return { ...base, kind: 'reading', content: { kind: 'reading', markdown: child.markdown } };
  }
  return null;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 300);
}
