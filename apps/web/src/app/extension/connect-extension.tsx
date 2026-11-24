'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  createImportTokenResponseSchema,
  extensionAckSchema,
  type ExtensionConnectMessage,
} from '@epicfeed/contracts';

interface TokenRow {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}

// API di messaggistica che Chrome espone alle pagine elencate in
// `externally_connectable` dell'estensione. Assente negli altri browser.
interface ChromeRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (response: unknown) => void): void;
  lastError?: { message?: string };
}

function chromeRuntime(): ChromeRuntime | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
}

function sendToExtension(extensionId: string, message: ExtensionConnectMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const runtime = chromeRuntime();
    if (!runtime) {
      reject(new Error('missing'));
      return;
    }
    runtime.sendMessage(extensionId, message, (response) => {
      if (runtime.lastError) reject(new Error(runtime.lastError.message ?? 'missing'));
      else resolve(response);
    });
  });
}

const dateFormat = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Pulsante "Collega l'estensione" ed elenco dei collegamenti attivi.
 * Il token in chiaro passa dalla risposta dell'API direttamente all'estensione,
 * senza essere mostrato né salvato nella pagina.
 */
export function ConnectExtension({
  extensionId,
  tokens,
}: {
  extensionId: string;
  tokens: TokenRow[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const connect = () => {
    startTransition(async () => {
      setMessage(null);
      if (!extensionId || !chromeRuntime()) {
        setMessage({
          text: 'Estensione non trovata: installala in Chrome (vedi le istruzioni qui sotto) e ricarica la pagina.',
          error: true,
        });
        return;
      }
      const response = await fetch('/api/extension/token', { method: 'POST' });
      const parsed = createImportTokenResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed.success) {
        setMessage({ text: 'Non è stato possibile creare il collegamento. Riprova.', error: true });
        return;
      }
      try {
        const ack = extensionAckSchema.safeParse(
          await sendToExtension(extensionId, {
            type: 'study-feed/connect',
            token: parsed.data.token,
            expiresAt: parsed.data.expiresAt,
            apiBaseUrl: window.location.origin,
          }),
        );
        if (!ack.success || !ack.data.ok) throw new Error('rifiutato');
        setMessage({
          text: 'Estensione collegata. Ora puoi importare le lezioni dal portale.',
          error: false,
        });
      } catch {
        setMessage({
          text: "L'estensione non ha risposto: controlla che sia installata e attiva, poi riprova.",
          error: true,
        });
      }
      router.refresh();
    });
  };

  const revoke = (id: string) => {
    startTransition(async () => {
      await fetch(`/api/extension/token/${id}`, { method: 'DELETE' });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-col gap-3 rounded-card p-5 text-sm">
        <p>
          L&apos;estensione legge la lezione che hai aperto sul portale Epicode e la invia qui. Per
          farlo usa un collegamento valido 30 giorni, che serve solo a importare: non dà accesso al
          resto del tuo account.
        </p>
        <button
          type="button"
          onClick={connect}
          disabled={pending}
          className="self-start rounded-md bg-accent px-4 py-2.5 font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? 'Collegamento…' : "Collega l'estensione"}
        </button>
        {message && (
          <p role="status" className={message.error ? 'text-accent-text' : 'text-muted'}>
            {message.text}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted">
          Collegamenti attivi
        </h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">Nessuno.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="glass flex items-center justify-between gap-3 rounded-card p-4 text-sm"
              >
                <div className="flex flex-col">
                  <span>{token.label}</span>
                  <span className="font-mono text-[11px] text-muted">
                    scade il {dateFormat.format(new Date(token.expiresAt))}
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
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
