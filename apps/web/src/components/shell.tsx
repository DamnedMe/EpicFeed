import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/app/login/actions';

/** Cornice delle pagine riservate: intestazione con navigazione e uscita. */
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="font-display text-lg font-bold tracking-tight">
          Epic<span className="text-accent-text">Feed</span>
        </Link>
        <nav className="flex items-center gap-4 font-mono text-xs text-muted">
          <Link href="/" className="hover:text-text">
            Feed
          </Link>
          <Link href="/profile" className="hover:text-text">
            Io
          </Link>
          <Link href="/lessons" className="hover:text-text">
            Lezioni
          </Link>
          <Link href="/extension" className="hover:text-text">
            Estensione
          </Link>
          <Link href="/claude-desktop" className="hover:text-text">
            Claude
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
