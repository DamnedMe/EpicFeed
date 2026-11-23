import { BottomNav } from '@/components/bottom-nav';

/**
 * Schermata di attesa tra una sezione e l'altra. Next.js la mostra appena si
 * tocca un collegamento (e la scarica in anticipo con il prefetch dei link),
 * mentre il server prepara la pagina: il tocco ha sempre una risposta
 * immediata, anche con la rete lenta.
 */
export default function Loading() {
  return (
    <div className="ef-app">
      <div className="ef-empty" role="status" aria-busy="true" aria-label="Caricamento">
        <div className="ef-skeleton w-2/3" />
        <div className="ef-skeleton" />
        <div className="ef-skeleton w-5/6" />
      </div>
      <BottomNav />
    </div>
  );
}
