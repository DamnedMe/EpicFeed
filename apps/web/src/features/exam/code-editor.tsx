'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Editor del codice: CodeMirror 6 caricato al primo uso (ADR 0017, scelta 4).
 * Finché il modulo non arriva, o se non si carica, si scrive in un'area di
 * testo semplice con lo stesso contenuto: la risposta non si perde mai.
 *
 * @param props.value - Testo attuale.
 * @param props.onChange - Chiamata a ogni modifica.
 * @param props.nonce - Nonce della CSP per gli stili di CodeMirror.
 * @param props.label - Etichetta accessibile.
 */
export function CodeEditor({
  value,
  onChange,
  nonce,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  nonce: string | null;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // Valori letti all'avvio dell'editor senza ricrearlo a ogni tasto.
  const initial = useRef({ value, onChange });
  useEffect(() => {
    initial.current.onChange = onChange;
  }, [onChange]);

  useEffect(() => {
    let destroyed = false;
    let destroy: (() => void) | null = null;
    void import('./codemirror-setup')
      .then(({ createPythonEditor }) => {
        const host = hostRef.current;
        if (destroyed || !host) return;
        const view = createPythonEditor(host, {
          doc: initial.current.value,
          nonce,
          label,
          placeholder: '# Write your Python code here',
          onChange: (next) => {
            initial.current.value = next;
            initial.current.onChange(next);
          },
        });
        destroy = () => {
          view.destroy();
        };
        setReady(true);
      })
      .catch(() => {
        // Resta l'area di testo semplice.
      });
    return () => {
      destroyed = true;
      destroy?.();
    };
  }, [nonce, label]);

  return (
    <div className="ef-ex-editor">
      <div ref={hostRef} hidden={!ready} />
      {ready ? null : (
        <textarea
          className="ef-ex-text mono"
          aria-label={label}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={10}
          value={value}
          placeholder="# Write your Python code here"
          onChange={(event) => {
            initial.current.value = event.target.value;
            onChange(event.target.value);
          }}
        />
      )}
    </div>
  );
}
