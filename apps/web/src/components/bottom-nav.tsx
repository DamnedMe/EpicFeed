import Link from 'next/link';
import { Icon } from '@/features/feed/icons';

/**
 * Barra in basso del design approvato: Feed · Ripasso · Libri · Io (ADR 0015,
 * punto 7). Ripasso (M4) e Libri (M7) sono visibili ma spenti. Senza `active`
 * (durante il caricamento di una pagina) nessuna voce è evidenziata.
 */
export function BottomNav({ active }: { active?: 'feed' | 'io' }) {
  return (
    <nav className="ef-nav" aria-label="Sezioni">
      <Link
        href="/"
        className={active === 'feed' ? 'on' : ''}
        aria-current={active === 'feed' ? 'page' : undefined}
      >
        <Icon name="feed" />
        Feed
      </Link>
      <span className="off" aria-disabled="true">
        <Icon name="review" />
        Ripasso
        <small>in arrivo</small>
      </span>
      <span className="off" aria-disabled="true">
        <Icon name="books" />
        Libri
        <small>in arrivo</small>
      </span>
      <Link
        href="/io"
        className={active === 'io' ? 'on' : ''}
        aria-current={active === 'io' ? 'page' : undefined}
      >
        <Icon name="user" />
        Io
      </Link>
    </nav>
  );
}
