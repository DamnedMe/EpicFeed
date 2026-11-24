import Link from 'next/link';
import type { FeedLoad } from './feed-client';

/** Stato del caricamento del feed: in corso, oppure l'esito di `loadFeed`. */
export type LoadState = FeedLoad | { readonly status: 'loading' };

/**
 * Stati senza feed: caricamento, nessuna lezione pronta, errore.
 *
 * @param props.load - Stato del caricamento.
 * @param props.onRetry - Riprova a caricare la materia.
 */
export function FeedFallback({ load, onRetry }: { load: LoadState; onRetry: () => void }) {
  if (load.status === 'loading' || load.status === 'unauthorized') {
    return (
      <div className="ef-empty" aria-busy="true" aria-label="Caricamento del feed">
        <div className="ef-skeleton w-2/3" />
        <div className="ef-skeleton" />
        <div className="ef-skeleton w-5/6" />
      </div>
    );
  }
  if (load.status === 'empty') {
    return (
      <div className="ef-empty">
        <h1>Il feed è vuoto, per ora</h1>
        <p>
          {load.subjects.length === 0
            ? 'Importa una lezione dal portale con l’estensione, poi generane schede e quiz con Claude Desktop.'
            : 'Hai importato delle lezioni ma nessuna ha ancora schede: generale con Claude Desktop.'}
        </p>
        <p>
          <Link className="ef-link" href="/lessons">
            Le mie lezioni
          </Link>{' '}
          ·{' '}
          <Link className="ef-link" href="/extension">
            Estensione
          </Link>{' '}
          ·{' '}
          <Link className="ef-link" href="/claude-desktop">
            Claude Desktop
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="ef-empty">
      <h1>Non riesco a caricare il feed</h1>
      <p>Controlla la connessione e riprova. Se il problema resta, riprova tra qualche minuto.</p>
      <button type="button" className="ef-cta" onClick={onRetry}>
        Riprova
      </button>
    </div>
  );
}
