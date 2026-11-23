import type { Metadata } from 'next';
import { BottomNav } from '@/components/bottom-nav';
import { signOut } from '@/app/accedi/actions';
import { readAppearance } from '@/server/appearance';
import { requireUser } from '@/server/auth';
import { IoPanel } from './io-panel';

export const metadata: Metadata = { title: 'Io' };
export const dynamic = 'force-dynamic';

/**
 * Sezione *Io* (ADR 0015, punto 7): aspetto, preferenze di studio, schede
 * salvate, totali e collegamenti a lezioni, estensione e Claude Desktop.
 */
export default async function IoPage() {
  const user = await requireUser();
  const appearance = await readAppearance();
  return (
    <div className="ef-page">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Io</h1>
        <span className="truncate font-mono text-xs text-muted">{user.email}</span>
      </header>
      <IoPanel theme={appearance['data-theme']} accent={appearance['data-accent']} />
      <form action={signOut}>
        <button type="submit" className="ef-link">
          Esci da EpicFeed
        </button>
      </form>
      <BottomNav active="io" />
    </div>
  );
}
