import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomNav } from '@/components/bottom-nav';
import { QuestionsList } from '@/features/assistant/questions-list';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Le mie domande' };
export const dynamic = 'force-dynamic';

/** Domande in coda per Claude Desktop e risposte (M6, ADR 0021, scelta 1). */
export default async function QuestionsPage() {
  await requireUser();
  return (
    <div className="ef-page">
      <header className="flex flex-col gap-1">
        <Link href="/profile" className="font-mono text-xs text-muted">
          ← Io
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">Le mie domande</h1>
        <p className="text-sm text-muted">
          Le domande fatte con <em>Chiedi a Claude</em> senza chiave API. Sul PC, in Claude Desktop,
          chiedi «rispondi alle mie domande di EpicFeed»: le risposte arrivano qui.
        </p>
      </header>
      <QuestionsList />
      <BottomNav active="profile" />
    </div>
  );
}
