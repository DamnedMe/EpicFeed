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
 * Legge l'utente della richiesta. `getUser` verifica il token con Supabase
 * (non si fida del solo cookie), e un utente non ammesso è trattato come
 * non autenticato.
 *
 * @returns L'utente, oppure `null`.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
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
  if (!user) redirect('/accedi');
  if (!user.hasPassword) redirect('/accedi/password');
  return user;
}
