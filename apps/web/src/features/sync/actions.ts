'use server';

import { getCurrentUser } from '@/server/auth';
import { createSupabaseServerClient } from '@/server/supabase';

/** Esito di {@link confirmPassword}. */
export interface ConfirmPasswordResult {
  readonly ok: boolean;
  /** Email dell'account, per ricavare la chiave nel browser. */
  readonly email: string | null;
}

/**
 * Verifica la password dell'utente collegato, per sbloccare la
 * sincronizzazione dei progressi su questo dispositivo (ADR 0018). La password
 * serve al browser per ricavare la chiave; qui si controlla solo che sia
 * quella giusta, con lo stesso accesso di Supabase (e i suoi limiti di
 * tentativi).
 *
 * @param password - Password inserita.
 * @returns `ok` e l'email se la password è corretta.
 */
export async function confirmPassword(password: string): Promise<ConfirmPasswordResult> {
  const user = await getCurrentUser({ verifyWithServer: true });
  if (!user?.hasPassword || typeof password !== 'string' || password.length === 0) {
    return { ok: false, email: null };
  }
  if (password.length > 128) return { ok: false, email: null };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  return error ? { ok: false, email: null } : { ok: true, email: user.email };
}
