import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomNav } from '@/components/bottom-nav';
import { requireUser } from '@/server/auth';
import { SavedList } from './saved-list';

export const metadata: Metadata = { title: 'Salvati' };
export const dynamic = 'force-dynamic';

/** Schede salvate con il doppio tocco: stanno solo su questo dispositivo (ADR 0003). */
export default async function SavedPage() {
  await requireUser();
  return (
    <div className="ef-page">
      <header className="flex flex-col gap-1">
        <Link href="/io" className="font-mono text-xs text-muted">
          ← Io
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">Salvati</h1>
      </header>
      <SavedList />
      <BottomNav active="io" />
    </div>
  );
}
