import Link from 'next/link';
import { Icon } from '@/features/feed/icons';

/**
 * Barra in basso del design approvato: Feed · Ripasso · Libri · Io (ADR 0015,
 * punto 7). Ripasso (M4) contiene anche l'Esame (ADR 0017); Libri (M7) è
 * visibile ma spento. Senza `active` (durante il caricamento di una pagina)
 * nessuna voce è evidenziata. Solo icone: i nomi delle voci restano per i
 * lettori di schermo (`sr-only`) ma non si vedono, perché su mobile le
 * etichette sotto le icone appesantivano la barra.
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
        <span className="sr-only">Feed</span>
      </Link>
      <Link
        href="/ripasso"
        className={active === 'review' ? 'on' : ''}
        aria-current={active === 'review' ? 'page' : undefined}
      >
        <Icon name="review" />
        <span className="sr-only">Ripasso</span>
      </Link>
      <span className="off" aria-disabled="true">
        <Icon name="books" />
        <span className="sr-only">Libri, in arrivo</span>
      </span>
      <Link
        href="/io"
        className={active === 'io' ? 'on' : ''}
        aria-current={active === 'io' ? 'page' : undefined}
      >
        <Icon name="user" />
        <span className="sr-only">Io</span>
      </Link>
    </nav>
  );
}
