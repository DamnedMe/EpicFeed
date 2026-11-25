import 'server-only';
import { redirect } from 'next/navigation';
import { serverEnv } from './env';
import { createSupabaseServerClient } from './supabase';

/** Utente autenticato e ammesso all'app. */
export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  /** `false` finché l'utente non ha impostato una password dopo il primo accesso. */
  readonly hasPassword: boolean;
}

/**
 * Dice se un'email è tra quelle ammesse (`ALLOWED_EMAILS`).
 *
 * @param email - Email da controllare.
 * @returns `true` se ammessa.
 */
export function isEmailAllowed(email: string): boolean {
  return serverEnv().ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Legge l'utente della richiesta.
 *
 * Il token di sessione è firmato da Supabase con una chiave asimmetrica
 * (ES256): `getClaims` ne verifica firma e scadenza **in locale**, con la
 * chiave pubblica del progetto tenuta in memoria, senza chiamare il server di
 * autenticazione a ogni pagina (prima erano ~300 ms per richiesta). Il
 * compromesso: una sessione chiusa da un altro dispositivo resta valida qui
 * fino alla scadenza del token (al massimo un'ora); l'uscita da questo
 * dispositivo cancella subito i cookie. Vedi ADR 0016.
 *
 * Il campo `password_set` nel token si aggiorna solo al rinnovo: se dice
 * "manca la password" si chiede conferma al server, così chi l'ha appena
 * impostata non torna alla pagina della password. Un utente non ammesso è
 * trattato come non autenticato.
 *
 * @param options.verifyWithServer - `true` per chiedere sempre al server
 *   (`getUser`): per i flussi di accesso e per creare o revocare token.
 * @returns L'utente, oppure `null`.
 */
export async function getCurrentUser(
  options: { verifyWithServer?: boolean } = {},
): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  if (!options.verifyWithServer) {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    const email = typeof claims?.email === 'string' ? claims.email : '';
    if (error || !claims?.sub || !email || !isEmailAllowed(email)) return null;
    if (claims.user_metadata?.password_set === true) {
      return { id: claims.sub, email, hasPassword: true };
    }
  }
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.email || !isEmailAllowed(user.email)) return null;
  return {
    id: user.id,
    email: user.email,
    hasPassword: user.user_metadata.password_set === true,
  };
}

/**
 * Come {@link getCurrentUser}, ma manda alla pagina di accesso se manca l'utente
 * e a quella della password se non l'ha ancora impostata.
 *
 * @returns L'utente autenticato.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.hasPassword) redirect('/login/password');
  return user;
}
