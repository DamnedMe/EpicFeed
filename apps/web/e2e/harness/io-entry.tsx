/**
 * Banco di prova della sezione *Io* per Playwright: la stessa pagina del
 * server (`src/app/io/page.tsx`) senza sessione né server action.
 */
import { createRoot } from 'react-dom/client';
import { IoPanel } from '@/app/io/io-panel';
import { BottomNav } from '@/components/bottom-nav';

function IoPage() {
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

const root = document.getElementById('root');
if (root) createRoot(root).render(<IoPage />);
