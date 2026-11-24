/**
 * Pagine del banco di prova, condivise dagli ingressi del browser e dal
 * prerender (`prerender.tsx`): come Next.js, la pagina arriva già disegnata
 * dal server e il browser la idrata.
 */
import { IoPanel } from '@/app/io/io-panel';
import { BottomNav } from '@/components/bottom-nav';
import { FeedApp } from '@/features/feed/feed-app';
import type { SubjectFeed } from '@/features/feed/model';
import { ReviewApp } from '@/features/review/review-app';

export const ACCOUNT = '0a0a0a0a-0000-4000-8000-00000000000a';

/** Feed, con la prima lezione disegnata sul server se non c'è una copia. */
export function FeedPage({ preview }: { preview: SubjectFeed | null }) {
  return <FeedApp account={ACCOUNT} preview={preview} />;
}

/** Tab Ripasso (lo stesso nonce della CSP del banco, per gli stili dell'editor). */
export function ReviewPage({ syncKey }: { syncKey: boolean }) {
  return <ReviewApp account={ACCOUNT} nonce="e2e-nonce" syncKey={syncKey} />;
}

/** Pagina *Io* con i dati che metterebbe il server. */
export function IoPage() {
  return (
    <div className="ef-page">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Io</h1>
        <span className="truncate font-mono text-xs text-muted">studente@example.com</span>
      </header>
      <IoPanel theme="dark" accent="racing-red" />
      <BottomNav active="io" />
    </div>
  );
}
