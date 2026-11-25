import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomNav } from '@/components/bottom-nav';
import { ReportsList } from '@/features/feed/report/reports-list';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Le mie segnalazioni' };
export const dynamic = 'force-dynamic';

/** Correzioni fatte con Segnala errore (M5, ADR 0020): stato e annullamento. */
export default async function ReportsPage() {
  await requireUser();
  return (
    <div className="ef-page">
      <header className="flex flex-col gap-1">
        <Link href="/profile" className="font-mono text-xs text-muted">
          ← Io
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">Le mie segnalazioni</h1>
        <p className="text-sm text-muted">
          Valgono solo per te, su tutti i tuoi dispositivi, e restano anche quando la lezione viene
          rigenerata.
        </p>
      </header>
      <ReportsList />
      <BottomNav active="profile" />
    </div>
  );
}
