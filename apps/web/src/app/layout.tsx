import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { readAppearance } from '@/server/appearance';
import './globals.css';
import '@/components/shell.css';
import '@/features/feed/styles/top-bar.css';
import '@/features/feed/styles/cards.css';
import '@/features/feed/styles/quiz.css';
import '@/features/feed/styles/effects.css';
import '@/features/feed/styles/sheets.css';
import '@/components/bottom-nav.css';
import '@/components/page.css';
import '@/features/review/review.css';
import '@/features/exam/exam.css';

// Font self-hosted da next/font: scaricati alla build, serviti dall'app (CSP `font-src 'self'`).
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--ef-font-display',
});
const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--ef-font-body',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--ef-font-mono',
});

export const metadata: Metadata = {
  title: { default: 'EpicFeed', template: '%s · EpicFeed' },
  description: 'Le lezioni Epicode trasformate in schede, quiz e ripasso.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
  // Su iPhone, aperta dalla schermata Home, l'app occupa tutto lo schermo.
  appleWebApp: { capable: true, title: 'EpicFeed', statusBarStyle: 'black-translucent' },
};

// Tutte le pagine sono dinamiche: la CSP usa un nonce diverso a ogni richiesta
// (vedi `proxy.ts`) e quasi ogni pagina dipende dalla sessione.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#0B0B0E',
  width: 'device-width',
  initialScale: 1,
  // Il feed occupa anche le zone del notch: i margini usano env(safe-area-inset-*).
  viewportFit: 'cover',
};

/**
 * Layout radice. Tema e accento arrivano dai cookie scelti in *Io* (ADR 0015),
 * così la pagina nasce già nei colori giusti.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const appearance = await readAppearance();
  return (
    <html
      lang="it"
      {...appearance}
      className={`ef-fonts ${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh bg-background text-text">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
