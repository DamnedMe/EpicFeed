import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { serverEnv } from './env';

/**
 * Client Supabase lato server, legato ai cookie della richiesta. Si usa solo
 * per l'autenticazione (login, sessione): i dati passano da Drizzle e dalla RLS.
 * La chiave è quella pubblicabile: la chiave `service_role` non serve alla web app.
 *
 * @returns Il client Supabase della richiesta corrente.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = serverEnv();
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Nei Server Component i cookie sono in sola lettura: la sessione la
            // rinnova `proxy.ts` a ogni richiesta, quindi qui si può ignorare.
          }
        },
      },
    },
  );
}
