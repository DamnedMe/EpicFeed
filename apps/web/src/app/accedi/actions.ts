'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import * as z from 'zod';
import { getCurrentUser, isEmailAllowed } from '@/server/auth';
import { createSupabaseServerClient } from '@/server/supabase';

/** Stato restituito dai form di accesso (per `useActionState`). */
export interface AuthFormState {
  readonly step: 'email' | 'code';
  readonly email: string;
  readonly message: string | null;
  readonly error: boolean;
}

const emailSchema = z.email().max(254);
const codeSchema = z.string().regex(/^[0-9]{6,10}$/);
// Requisiti minimi della password: lunghezza prima di tutto (NIST SP 800-63B).
const passwordSchema = z.string().min(12).max(128);

/** Legge un campo testuale del form (un file o un campo mancante diventano ''). */
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

const GENERIC_SENT =
  "Se l'indirizzo è abilitato, ti abbiamo inviato un'email: apri il link da questo browser, oppure scrivi qui il codice se l'email ne contiene uno. Controlla anche lo spam.";

/**
 * Invia il codice monouso via email (primo accesso o password dimenticata).
 * Per gli indirizzi non ammessi non invia nulla ma risponde allo stesso modo,
 * così il form non rivela chi è iscritto.
 */
export async function sendCode(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = emailSchema.safeParse(field(form, 'email').trim().toLowerCase());
  if (!email.success) {
    return {
      step: 'email',
      email: '',
      message: 'Inserisci un indirizzo email valido.',
      error: true,
    };
  }
  if (isEmailAllowed(email.data)) {
    const supabase = await createSupabaseServerClient();
    // Le email predefinite di Supabase contengono un link (il codice compare
    // solo con un modello personalizzato): il link torna a /accedi/callback.
    const redirectTo = await callbackUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      options: redirectTo
        ? { shouldCreateUser: true, emailRedirectTo: redirectTo }
        : { shouldCreateUser: true },
    });
    if (error) {
      return {
        step: 'email',
        email: email.data,
        message: 'Invio non riuscito: attendi un minuto e riprova.',
        error: true,
      };
    }
  }
  return { step: 'code', email: email.data, message: GENERIC_SENT, error: false };
}

/**
 * Indirizzo di ritorno del link email, costruito dall'origine della richiesta.
 * Supabase accetta solo indirizzi della sua lista di redirect, quindi
 * un'origine falsificata non porta il link altrove.
 */
async function callbackUrl(): Promise<string | undefined> {
  const origin = (await headers()).get('origin');
  return origin ? `${origin}/accedi/callback` : undefined;
}

/** Verifica il codice ricevuto via email e apre la sessione. */
export async function verifyCode(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = emailSchema.safeParse(field(form, 'email').trim().toLowerCase());
  const code = codeSchema.safeParse(field(form, 'code').replace(/\s/g, ''));
  if (!email.success || !code.success) {
    return {
      step: 'code',
      email: email.success ? email.data : '',
      message: 'Il codice è fatto di sole cifre.',
      error: true,
    };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email: email.data,
    token: code.data,
    type: 'email',
  });
  if (error || !isEmailAllowed(email.data)) {
    if (!error) await supabase.auth.signOut();
    return { step: 'code', email: email.data, message: 'Codice errato o scaduto.', error: true };
  }
  const user = await getCurrentUser({ verifyWithServer: true });
  redirect(user?.hasPassword ? '/lezioni' : '/accedi/password');
}

/** Accesso quotidiano con email e password. */
export async function signInWithPassword(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(field(form, 'email').trim().toLowerCase());
  const password = field(form, 'password');
  const failed: AuthFormState = {
    step: 'email',
    email: email.success ? email.data : '',
    message: 'Email o password non corretti.',
    error: true,
  };
  if (!email.success || password.length === 0 || !isEmailAllowed(email.data)) return failed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
  if (error) return failed;
  redirect('/lezioni');
}

/** Stato del form "imposta la password". */
export interface PasswordFormState {
  readonly message: string | null;
}

/** Imposta (o cambia) la password dell'utente già collegato. */
export async function setPassword(
  _prev: PasswordFormState,
  form: FormData,
): Promise<PasswordFormState> {
  const user = await getCurrentUser({ verifyWithServer: true });
  if (!user) redirect('/accedi');

  const password = field(form, 'password');
  const confirm = field(form, 'confirm');
  if (!passwordSchema.safeParse(password).success) {
    return { message: 'La password deve avere almeno 12 caratteri.' };
  }
  if (password !== confirm) return { message: 'Le due password non coincidono.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
  if (error) {
    return {
      message:
        error.code === 'weak_password'
          ? 'Password troppo debole o già comparsa in una violazione: scegline un’altra.'
          : 'Non è stato possibile salvare la password. Riprova.',
    };
  }
  redirect('/lezioni');
}

/** Chiude la sessione. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/accedi');
}
