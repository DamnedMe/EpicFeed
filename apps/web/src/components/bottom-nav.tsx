import Link from 'next/link';
import { Icon } from '@/features/feed/icons';

/**
 * Barra in basso del design approvato: Feed · Ripasso · Libri · Io (ADR 0015,
 * punto 7). Ripasso (M4) contiene anche l'Esame (ADR 0017); Libri (M7) è
 * visibile ma spento. Senza `active` (durante il caricamento di una pagina)
 * nessuna voce è evidenziata. Solo icone: il nome di ogni voce resta per i
 * lettori di schermo (`aria-label`) e come suggerimento al passaggio (`title`).
 */
export function BottomNav({ active }: { active?: 'feed' | 'review' | 'io' }) {
  return (
    <nav className="ef-nav" aria-label="Sezioni">
      <Link
        href="/"
        aria-label="Feed"
        title="Feed"
        className={active === 'feed' ? 'on' : ''}
        aria-current={active === 'feed' ? 'page' : undefined}
      >
        <Icon name="feed" />
      </Link>
      <Link
        href="/ripasso"
        aria-label="Ripasso"
        title="Ripasso"
        className={active === 'review' ? 'on' : ''}
        aria-current={active === 'review' ? 'page' : undefined}
      >
        <Icon name="review" />
      </Link>
      <span
        className="off"
        role="link"
        aria-disabled="true"
        aria-label="Libri, in arrivo"
        title="Libri, in arrivo"
      >
        <Icon name="books" />
      </span>
      <Link
        href="/io"
        aria-label="Io"
        title="Io"
        className={active === 'io' ? 'on' : ''}
        aria-current={active === 'io' ? 'page' : undefined}
      >
        <Icon name="user" />
      </Link>
    </nav>
  );
}
