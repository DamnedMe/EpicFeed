'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { forgetPasswordKey, rememberPasswordKey } from '@/features/sync/engine';
import { setPassword, type PasswordFormState } from '../actions';

const input =
  'w-full rounded-md border border-border bg-surface px-3 py-2.5 text-text focus:outline-2 focus:outline-accent';

const initial: PasswordFormState = { message: null };

/**
 * Form per impostare la password dopo il primo accesso con codice, o per
 * cambiarla. Dalla nuova password si ricava anche la chiave dei progressi
 * sincronizzati (ADR 0018): la copia sul server si rifà da questo dispositivo.
 */
export function PasswordForm({ email, account }: { email: string; account: string }) {
  const [state, action, pending] = useActionState(setPassword, initial);
  const [preparing, setPreparing] = useState(false);

  // Password non salvata: la chiave nuova non vale.
  useEffect(() => {
    if (state.message) void forgetPasswordKey();
  }, [state]);

  const submit = async (form: FormData) => {
    const password = form.get('password');
    const confirm = form.get('confirm');
    if (typeof password === 'string' && password.length >= 12 && password === confirm) {
      setPreparing(true);
      await rememberPasswordKey(email, password, account);
      setPreparing(false);
    }
    startTransition(() => {
      action(form);
    });
  };
  const busy = pending || preparing;

  return (
    <form action={submit} className="glass flex flex-col gap-4 rounded-card p-5">
      <label className="flex flex-col gap-1.5 text-sm">
        Nuova password (almeno 12 caratteri)
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Ripeti la password
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={input}
        />
      </label>
      {state.message && (
        <p role="alert" className="text-sm text-accent-text">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-3 py-2.5 font-medium text-on-accent disabled:opacity-60"
      >
        {busy ? 'Salvataggio…' : 'Salva la password'}
      </button>
    </form>
  );
}
