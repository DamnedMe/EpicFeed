'use client';

import { useActionState } from 'react';
import { setPassword, type PasswordFormState } from '../actions';

const input =
  'w-full rounded-md border border-border bg-surface px-3 py-2.5 text-text focus:outline-2 focus:outline-accent';

const initial: PasswordFormState = { message: null };

/** Form per impostare la password dopo il primo accesso con codice. */
export function PasswordForm() {
  const [state, action, pending] = useActionState(setPassword, initial);
  return (
    <form action={action} className="glass flex flex-col gap-4 rounded-card p-5">
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
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2.5 font-medium text-on-accent disabled:opacity-60"
      >
        {pending ? 'Salvataggio…' : 'Salva la password'}
      </button>
    </form>
  );
}
