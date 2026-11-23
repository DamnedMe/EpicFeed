import Link from 'next/link';
import { Icon } from '@/features/feed/icons';

/**
 * Barra in basso del design approvato: Feed · Ripasso · Libri · Io (ADR 0015,
 * punto 7). Ripasso (M4) contiene anche l'Esame (ADR 0017); Libri (M7) è
 * visibile ma spento. Senza `active` (durante il caricamento di una pagina)
 * nessuna voce è evidenziata.
 */
export function BottomNav({ active }: { active?: 'feed' | 'review' | 'io' }) {
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
      <Link
        href="/ripasso"
        className={active === 'review' ? 'on' : ''}
        aria-current={active === 'review' ? 'page' : undefined}
      >
        <Icon name="review" />
        Ripasso
      </Link>
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
