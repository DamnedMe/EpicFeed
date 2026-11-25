'use client';

import { useState } from 'react';
import { confirmPassword } from './actions';
import type { SyncStatus } from './engine';
import { rememberPasswordKey, syncNow, useSyncStatus } from './engine';

/**
 * Stato della sincronizzazione nel Ripasso (ADR 0018). Se su questo
 * dispositivo manca la chiave, o la password è cambiata altrove, chiede la
 * password: il server la verifica e il browser ne ricava la chiave, che non
 * lascia mai il dispositivo.
 *
 * @param props.account - Utente della sessione.
 * @param props.keyExpected - `false` se il server sa che il dispositivo non ha
 *   la chiave: la richiesta della password si mostra subito, senza aspettare
 *   il controllo sul dispositivo.
 */
export function SyncPanel({
  account,
  keyExpected = true,
}: {
  account: string;
  keyExpected?: boolean;
}) {
  const live = useSyncStatus();
  const pending = live.state === 'idle' || live.state === 'syncing';
  const status: SyncStatus = !keyExpected && pending ? { state: 'nokey' } : live;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.state === 'nokey' || status.state === 'locked') {
    const unlock = async () => {
      setBusy(true);
      setError(null);
      try {
        const result = await confirmPassword(password);
        if (!result.ok || !result.email) {
          setError('Password non corretta.');
          return;
        }
        if (!(await rememberPasswordKey(result.email, password, account))) {
          setError('Questo browser non permette di cifrare i progressi.');
          return;
        }
        setPassword('');
        await syncNow(account);
      } catch {
        setError('Non riesco a verificare la password: controlla la connessione.');
      } finally {
        setBusy(false);
      }
    };
    return (
      <section className="ef-panel ef-rv-box" aria-labelledby="rv-sync">
        <h2 id="rv-sync" className="ef-rv-label">
          {status.state === 'locked' ? 'La password è cambiata' : 'Sincronizza telefono e PC'}
        </h2>
        <p className="ef-rv-note">
          {status.state === 'locked'
            ? 'I progressi sul server sono cifrati con la password nuova: scrivila per unirli a quelli di questo dispositivo.'
            : 'Scrivi la password di EpicFeed: diventa la chiave che cifra i progressi su questo dispositivo, così il server ne conserva una copia che non può leggere.'}
        </p>
        <form
          className="ef-rv-unlock"
          onSubmit={(event) => {
            event.preventDefault();
            void unlock();
          }}
        >
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            aria-label="Password"
            placeholder="Password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <button type="submit" className="ef-cta" disabled={busy || password.length === 0}>
            {busy ? 'Verifico…' : 'Sblocca'}
          </button>
        </form>
        {error ? (
          <p role="alert" className="ef-rv-note">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const note: Partial<Record<typeof status.state, string>> = {
    syncing: 'Sincronizzo i progressi…',
    synced: 'Progressi sincronizzati tra i tuoi dispositivi, cifrati sul dispositivo.',
    offline: 'Sincronizzazione in attesa della rete.',
    error: 'Sincronizzazione non riuscita: riprovo più tardi.',
  };
  const text = note[status.state];
  return text ? (
    <p className="ef-rv-note ef-rv-sync" role="status">
      {text}
    </p>
  ) : null;
}
