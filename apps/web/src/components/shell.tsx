import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/app/accedi/actions';

/** Cornice delle pagine riservate: intestazione con navigazione e uscita. */
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <Link href="/lezioni" className="font-display text-lg font-bold tracking-tight">
          Study<span className="text-accent-text">Feed</span>
        </Link>
        <nav className="flex items-center gap-4 font-mono text-xs text-muted">
          <Link href="/lezioni" className="hover:text-text">
            Lezioni
          </Link>
          <Link href="/estensione" className="hover:text-text">
            Estensione
          </Link>
          <form action={signOut}>
            <button type="submit" className="hover:text-text">
              Esci
            </button>
          </form>
        </nav>
      </header>
      <main className="flex flex-col gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  );
}
