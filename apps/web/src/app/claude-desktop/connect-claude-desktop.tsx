'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createGenerateTokenResponseSchema } from '@epicfeed/contracts';

interface TokenRow {
  id: string;
  label: string;
  expiresAt: string;
  lastUsedAt: string | null;
  /** Calcolato dal server: scade entro una settimana. */
  expiringSoon: boolean;
}

const dateFormat = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Pulsante "Crea token", token appena creato (mostrato una sola volta, da
 * copiare in Claude Desktop) ed elenco dei token attivi con la revoca.
 * Il token in chiaro vive solo nello stato del componente: non viene salvato
 * nel browser e sparisce ricaricando la pagina.
 */
export function ConnectClaudeDesktop({ tokens }: { tokens: TokenRow[] }) {
  const router = useRouter();
  const [created, setCreated] = useState<{ token: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch('/api/generation/token', { method: 'POST' });
      const parsed = createGenerateTokenResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed.success) {
        setMessage({ text: 'Non è stato possibile creare il token. Riprova.', error: true });
        return;
      }
      setCreated(parsed.data);
      router.refresh();
    });
  };

  const copy = () => {
    if (!created) return;
    navigator.clipboard.writeText(created.token).then(
      () => {
        setMessage({ text: 'Token copiato.', error: false });
      },
      () => {
        setMessage({ text: 'Copia non riuscita: selezionalo e copialo a mano.', error: true });
      },
    );
  };

  const revoke = (id: string) => {
    startTransition(async () => {
      await fetch(`/api/generation/token/${id}`, { method: 'DELETE' });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-col gap-3 rounded-card p-5 text-sm">
        <p>
          Claude Desktop genera schede e quiz delle lezioni importate tramite l&apos;estensione
          EpicFeed. Per collegarla serve un token valido 90 giorni, che permette solo di leggere le
          lezioni che hai importato e di salvarne le schede: non dà accesso al resto del tuo
          account.
        </p>
        <ol className="list-decimal pl-5 text-muted">
          <li>Crea il token qui sotto e copialo: lo vedi una volta sola.</li>
          <li>
            In Claude Desktop apri <em>Impostazioni → Estensioni → EpicFeed</em> e incollalo nel
            campo del token.
          </li>
          <li>Chiedi a Claude, per esempio: &quot;genera le lezioni nuove di EpicFeed&quot;.</li>
        </ol>
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="self-start rounded-md bg-accent px-4 py-2.5 font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? 'Creazione…' : 'Crea token'}
        </button>
        {created && (
          <div className="flex flex-col gap-2">
            <code className="break-all rounded-md border border-border bg-surface p-3 font-mono text-xs">
              {created.token}
            </code>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={copy}
                className="rounded-md border border-border px-3 py-1.5 font-mono text-xs"
              >
                Copia
              </button>
              <span className="font-mono text-[11px] text-muted">
                scade il {dateFormat.format(new Date(created.expiresAt))}
              </span>
            </div>
          </div>
        )}
        {message && (
          <p role="status" className={message.error ? 'text-accent-text' : 'text-muted'}>
            {message.text}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Token attivi</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">Nessuno.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => {
              const expiring = token.expiringSoon;
              return (
                <li
                  key={token.id}
                  className="glass flex items-center justify-between gap-3 rounded-card p-4 text-sm"
                >
                  <div className="flex flex-col">
                    <span>{token.label}</span>
                    <span
                      className={`font-mono text-[11px] ${expiring ? 'text-accent-text' : 'text-muted'}`}
                    >
                      {expiring ? 'scade presto: ' : 'scade il '}
                      {dateFormat.format(new Date(token.expiresAt))}
                      {token.lastUsedAt
                        ? ` · ultimo uso ${dateFormat.format(new Date(token.lastUsedAt))}`
                        : ' · mai usato'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      revoke(token.id);
                    }}
                    disabled={pending}
                    className="font-mono text-xs text-muted hover:text-accent-text"
                  >
                    Revoca
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
