import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DEFAULT_ACCENT, DEFAULT_THEME } from '@study-feed/ui';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Study Feed', template: '%s · Study Feed' },
  description: 'Le lezioni Epicode trasformate in schede, quiz e ripasso.',
  robots: { index: false, follow: false },
};

// Tutte le pagine sono dinamiche: la CSP usa un nonce diverso a ogni richiesta
// (vedi `proxy.ts`) e quasi ogni pagina dipende dalla sessione.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#0B0B0E',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Layout radice. Tema e accento predefiniti (scuro + racing red) finché la
 * sezione Io non permette di sceglierli (M4).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" data-theme={DEFAULT_THEME} data-accent={DEFAULT_ACCENT}>
      <body className="min-h-dvh bg-background text-text">{children}</body>
    </html>
  );
}
