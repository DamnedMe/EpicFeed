import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Proxy di Next.js (ex middleware), eseguito prima di ogni pagina:
 * 1. genera un nonce e imposta una Content Security Policy rigorosa
 *    (nessuno script inline senza nonce, nessun frame, connessioni solo verso
 *    l'app e Supabase);
 * 2. rinnova la sessione di Supabase nei cookie e verifica il token;
 * 3. manda alla pagina di accesso chi apre una pagina protetta senza sessione.
 *
 * Le route `/api/*` sono escluse: si autenticano da sole (token o sessione).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce, request.nextUrl.protocol === 'https:');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let signedIn = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });
    // Rinnova il token nei cookie se sta per scadere e ne verifica firma e
    // scadenza in locale (chiave pubblica ES256 del progetto, tenuta in
    // memoria): nessuna chiamata al server di autenticazione per pagina.
    const { data, error } = await supabase.auth.getClaims();
    signedIn = !error && Boolean(data?.claims.sub);
  }

  const path = request.nextUrl.pathname;
  if (!signedIn && !path.startsWith('/login')) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    response = NextResponse.redirect(login);
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

function contentSecurityPolicy(nonce: string, https: boolean): string {
  const dev = process.env.NODE_ENV === 'development';
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' blob: data:",
    // Service worker e manifest della PWA: solo dall'app.
    "worker-src 'self'",
    "manifest-src 'self'",
    "font-src 'self'",
    `connect-src 'self' ${supabase}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Solo in HTTPS: in locale (http://localhost) romperebbe il caricamento delle risorse.
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|icons/|readme/|pyodide/|python-worker.js|manifest.webmanifest|sw.js).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
