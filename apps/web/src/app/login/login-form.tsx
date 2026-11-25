'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { forgetPasswordKey, rememberPasswordKey } from '@/features/review/sync/engine';
import { sendCode, signInWithPassword, verifyCode, type AuthFormState } from './actions';

const initial: AuthFormState = { step: 'email', email: '', message: null, error: false };

const input =
  'w-full rounded-md border border-border bg-surface px-3 py-2.5 text-text placeholder:text-muted focus:outline-2 focus:outline-accent';
const primary =
  'w-full rounded-md bg-accent px-3 py-2.5 font-medium text-on-accent disabled:opacity-60';
const link = 'font-mono text-xs text-muted underline-offset-4 hover:text-text hover:underline';

/**
 * Form di accesso: email e password per l'uso quotidiano, oppure codice via
 * email per il primo accesso e per il recupero (ADR 0007).
 */
export function LoginForm() {
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [codeState, codeAction, codePending] = useActionState(
    async (prev: AuthFormState, form: FormData) =>
      prev.step === 'email' ? sendCode(prev, form) : verifyCode(prev, form),
    initial,
  );
  const [pwdState, pwdAction, pwdPending] = useActionState(signInWithPassword, initial);
  const [preparing, setPreparing] = useState(false);

  // Accesso non riuscito: la chiave ricavata da una password sbagliata non serve.
  useEffect(() => {
    if (pwdState.error) void forgetPasswordKey();
  }, [pwdState]);

  /**
   * Prima di entrare ricava dalla password la chiave che cifra i progressi
   * sincronizzati (ADR 0018): è l'unico momento in cui il browser ha la
   * password, che non viene salvata.
   */
  const submitPassword = async (form: FormData) => {
    const email = form.get('email');
    const password = form.get('password');
    setPreparing(true);
    if (typeof email === 'string' && typeof password === 'string' && password) {
      await rememberPasswordKey(email, password);
    }
    setPreparing(false);
    startTransition(() => {
      pwdAction(form);
    });
  };

  if (mode === 'password') {
    const busy = pwdPending || preparing;
    return (
      <form action={submitPassword} className="glass flex flex-col gap-4 rounded-card p-5">
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input name="email" type="email" autoComplete="email" required className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={input}
          />
        </label>
        {pwdState.message && (
          <p role="alert" className="text-sm text-accent-text">
            {pwdState.message}
          </p>
        )}
        <button type="submit" disabled={busy} className={primary}>
          {busy ? 'Accesso…' : 'Entra'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('code');
          }}
          className={link}
        >
          Primo accesso o password dimenticata? Ricevi un codice via email
        </button>
      </form>
    );
  }

  return (
    <form action={codeAction} className="glass flex flex-col gap-4 rounded-card p-5">
      <label className="flex flex-col gap-1.5 text-sm">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={codeState.email}
          readOnly={codeState.step === 'code'}
          className={input}
        />
      </label>
      {codeState.step === 'code' && (
        <label className="flex flex-col gap-1.5 text-sm">
          Codice ricevuto
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,12}"
            required
            className={`${input} font-mono tracking-[0.3em]`}
          />
        </label>
      )}
      {codeState.message && (
        <p
          role="status"
          className={`text-sm ${codeState.error ? 'text-accent-text' : 'text-muted'}`}
        >
          {codeState.message}
        </p>
      )}
      <button type="submit" disabled={codePending} className={primary}>
        {codeState.step === 'email'
          ? codePending
            ? 'Invio…'
            : 'Inviami il codice'
          : codePending
            ? 'Verifica…'
            : 'Verifica il codice'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode('password');
        }}
        className={link}
      >
        Ho già una password
      </button>
    </form>
  );
}
