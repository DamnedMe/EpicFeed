import type { Metadata } from 'next';
import Link from 'next/link';
import { BottomNav } from '@/components/bottom-nav';
import { AssistantSettingsPanel } from '@/features/assistant/assistant-settings';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Assistente' };
export const dynamic = 'force-dynamic';

/** *Io › Assistente* (M6, ADR 0021): la chiave API dello studente. */
export default async function AssistantPage() {
  await requireUser();
  return (
    <div className="ef-page">
      <header className="flex flex-col gap-1">
        <Link href="/profile" className="font-mono text-xs text-muted">
          ← Io
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">Assistente</h1>
        <p className="text-sm text-muted">
          Con una tua chiave API, <em>Chiedi a Claude</em> risponde subito nel feed, anche sul
          telefono. La chiave resta su questo dispositivo e va direttamente al fornitore: il server
          di EpicFeed non la vede. Al fornitore arrivano la domanda e la scheda, mai email, password
          o token.
        </p>
      </header>
      <AssistantSettingsPanel />
      <BottomNav active="profile" />
    </div>
  );
}
