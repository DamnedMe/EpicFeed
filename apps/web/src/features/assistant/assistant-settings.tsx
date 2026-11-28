'use client';

import type { ProviderId } from '@epicfeed/assistant';
import {
  PROVIDERS,
  PROVIDER_IDS,
  cleanApiKey,
  looksLikeProviderKey,
  requestsToday,
} from '@epicfeed/assistant';
import { useState } from 'react';
import { FAILURE_MESSAGES, checkKey } from './assistant-client';
import { useAssistant } from './use-assistant';

/**
 * Chiave mascherata: si vedono solo l'inizio e la fine.
 *
 * @param key - Chiave.
 * @returns Il testo da mostrare.
 */
export function maskKey(key: string): string {
  return `${key.slice(0, 4)}${'•'.repeat(10)}${key.slice(-3)}`;
}

/**
 * *Io › Assistente* (M6, ADR 0021, scelta 0): fornitore, chiave API con il
 * link per crearla, prova, modello, richieste del giorno e rimozione.
 */
export function AssistantSettingsPanel() {
  const assistant = useAssistant();
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [key, setKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const saved = assistant.settings;
  const info = PROVIDERS[provider];
  const cleaned = cleanApiKey(key);
  const otherProvider = cleaned !== null && !looksLikeProviderKey(provider, cleaned);

  const testAndSave = async () => {
    if (!cleaned) return;
    setChecking(true);
    setProblem(null);
    const result = await checkKey(provider, cleaned);
    setChecking(false);
    if (result.status === 'failed') {
      setProblem(FAILURE_MESSAGES[result.failure]);
      return;
    }
    await assistant.save({
      provider,
      key: cleaned,
      model: result.model,
      models: result.models,
      savedAt: new Date().toISOString(),
    });
    setKey('');
    setEditing(false);
  };

  if (saved === undefined) return null;

  if (saved && !editing) {
    const savedInfo = PROVIDERS[saved.provider];
    return (
      <>
        <section className="ef-section" aria-labelledby="assistant-key">
          <h2 id="assistant-key">La tua chiave</h2>
          <div className="ef-panel">
            <div className="ef-row-link">
              {savedInfo.label}
              <small>{maskKey(saved.key)}</small>
            </div>
            <p className="ef-key-ok">Chiave valida · solo su questo dispositivo</p>
            <label className="ef-toggle" htmlFor="assistant-model">
              <span>
                Modello
                <small>Scelto il più veloce ed economico; puoi cambiarlo</small>
              </span>
              <select
                id="assistant-model"
                className="ef-select"
                value={saved.model}
                onChange={(event) => {
                  void assistant.save({ ...saved, model: event.target.value });
                }}
              >
                {(saved.models.includes(saved.model)
                  ? saved.models
                  : [saved.model, ...saved.models]
                ).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <div className="ef-row-link">
              Richieste oggi
              <small>{requestsToday(assistant.usage, new Date())}</small>
            </div>
            <p className="ef-key-note">{savedInfo.costNote}</p>
          </div>
        </section>
        <div className="ef-key-actions">
          <button
            type="button"
            className="ef-report-ghost"
            onClick={() => {
              setProvider(saved.provider);
              setEditing(true);
            }}
          >
            Cambia chiave
          </button>
          <button
            type="button"
            className="ef-report-ghost"
            onClick={() => {
              void assistant.remove();
            }}
          >
            Rimuovi chiave
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="ef-section" aria-labelledby="assistant-new">
      <h2 id="assistant-new">Fornitore</h2>
      <div className="ef-panel">
        <div className="ef-seg" role="group" aria-label="Fornitore">
          {PROVIDER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={provider === id}
              onClick={() => {
                setProvider(id);
                setProblem(null);
              }}
            >
              {PROVIDERS[id].label}
            </button>
          ))}
        </div>
        <a className="ef-row-link" href={info.keyUrl} target="_blank" rel="noopener noreferrer">
          {info.keyLinkLabel}
          <small>↗</small>
        </a>
        <ol className="ef-key-steps">
          {info.keySteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <form
          className="ef-key-form"
          onSubmit={(event) => {
            event.preventDefault();
            void testAndSave();
          }}
        >
          <label className="ef-report-field" htmlFor="assistant-key-input">
            <small>Chiave API</small>
            <span className="ef-key-input">
              <input
                id="assistant-key-input"
                type={visible ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={key}
                placeholder={`${info.keyPrefix}…`}
                onChange={(event) => {
                  setKey(event.target.value);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setVisible((shown) => !shown);
                }}
              >
                {visible ? 'Nascondi' : 'Mostra'}
              </button>
            </span>
          </label>
          {otherProvider ? (
            <p className="ef-key-note">
              Di solito le chiavi di {info.label} iniziano con {info.keyPrefix}: controlla di aver
              scelto il fornitore giusto.
            </p>
          ) : null}
          {problem ? (
            <p className="ef-ask-problem" role="alert">
              {problem}
            </p>
          ) : null}
          <button type="submit" className="ef-cta" disabled={!cleaned || checking}>
            {checking ? 'Provo la chiave…' : 'Prova e salva'}
          </button>
          {saved ? (
            <button
              type="button"
              className="ef-report-ghost"
              onClick={() => {
                setEditing(false);
              }}
            >
              Annulla
            </button>
          ) : null}
        </form>
        <p className="ef-key-note">{info.costNote}</p>
      </div>
    </section>
  );
}
