import type { Metadata } from 'next';
import Link from 'next/link';
import type { MyLesson } from '@epicfeed/adapters';
import { Shell } from '@/components/shell';
import { requireUser } from '@/server/auth';
import { getServices } from '@/server/container';

export const metadata: Metadata = { title: 'Le mie lezioni' };
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});

/**
 * "Le mie lezioni": le lezioni importate, raggruppate per materia, con lo
 * stato della generazione. La lettura passa dalla RLS (`MyLessonsQuery`).
 */
export default async function LessonsPage() {
  const user = await requireUser();
  const lessons = await getServices().myLessons.list(user.id);

  if (lessons.length === 0) {
    return (
      <Shell title="Le mie lezioni">
        <div className="glass flex flex-col gap-3 rounded-card p-5 text-sm">
          <p>Non hai ancora importato lezioni.</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>
              <Link href="/extension" className="text-accent-text underline underline-offset-4">
                Collega l&apos;estensione
              </Link>{' '}
              al tuo account.
            </li>
            <li>Apri una lezione sul portale Epicode.</li>
            <li>Premi l&apos;icona di EpicFeed e poi &quot;Importa&quot;.</li>
          </ol>
        </div>
      </Shell>
    );
  }

  // Le lezioni arrivano già ordinate per materia: basta raggrupparle in ordine.
  const bySubject = new Map<string, MyLesson[]>();
  for (const lesson of lessons) {
    const key = `${lesson.subjectTitle} · ${lesson.editionLabel}`;
    bySubject.set(key, [...(bySubject.get(key) ?? []), lesson]);
  }
  return (
    <Shell title="Le mie lezioni">
      {[...bySubject].map(([subject, items]) => (
        <section key={subject} className="flex flex-col gap-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted">{subject}</h2>
          <ul className="flex flex-col gap-2">
            {items.map((lesson) => (
              <LessonCard key={lesson.lessonId} lesson={lesson} />
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}

function LessonCard({ lesson }: { lesson: MyLesson }) {
  const { status } = lesson;
  const label =
    status.ready === lesson.partCount
      ? 'Pronta'
      : status.generating > 0
        ? 'Generazione in corso'
        : status.failed > 0
          ? 'Generazione da riprovare'
          : 'Da generare dal PC';
  const ready = status.ready === lesson.partCount;
  return (
    <li className="glass flex flex-col gap-1.5 rounded-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted">{lesson.chapterTitle}</span>
          <span className="font-medium">{lesson.lessonTitle}</span>
        </div>
        <span
          className={`shrink-0 rounded-sm px-2 py-0.5 font-mono text-[11px] ${
            ready ? 'bg-accent text-on-accent' : 'border border-border text-muted'
          }`}
        >
          {label}
        </span>
      </div>
      <p className="font-mono text-[11px] text-muted">
        {lesson.partCount} parti · sottotitoli in {lesson.partsWithSubtitles} · importata il{' '}
        {dateFormat.format(lesson.lastImportedAt)}
      </p>
    </li>
  );
}
