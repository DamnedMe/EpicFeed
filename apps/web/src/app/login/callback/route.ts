import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/server/auth';
import { createSupabaseServerClient } from '@/server/supabase';

/**
 * Ritorno dal link dell'email di accesso (flusso PKCE di Supabase): scambia il
 * `code` con una sessione e porta a impostare la password al primo accesso,
 * altrimenti a Le mie lezioni. Il link funziona solo nel browser da cui è
 * stato chiesto, perché lì c'è il cookie con il verificatore PKCE.
 *
 * @param request - Richiesta con `?code=…` (o `?error=…` se il link è scaduto).
 * @returns Un redirect.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code');
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  if (!code) return to('/login?errore=link');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to('/login?errore=link');

  // getCurrentUser ricontrolla anche l'elenco delle email ammesse.
  const user = await getCurrentUser({ verifyWithServer: true });
  if (!user) {
    await supabase.auth.signOut();
    return to('/login?errore=link');
  }
  return to(user.hasPassword ? '/lessons' : '/login/password');
}
