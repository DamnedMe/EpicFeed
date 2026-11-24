import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * Editor del codice Python degli esercizi d'esame (ADR 0017, scelta 4).
 * Questo modulo si carica solo al primo esercizio di codice (`import()` in
 * `code-editor.tsx`), così CodeMirror non pesa sulle altre pagine.
 *
 * Colori solo dai token del design system: l'editor segue tema e accento.
 */

/** Evidenziazione della sintassi con i token del design system. */
const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword],
    color: 'var(--sf-accent-text)',
    fontWeight: '600',
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--sf-text-muted)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--sf-accent-text)' },
  { tag: tags.comment, color: 'var(--sf-text-muted)', fontStyle: 'italic' },
  {
    tag: [tags.function(tags.definition(tags.variableName)), tags.definition(tags.className)],
    fontWeight: '700',
  },
]);

/** Aspetto dell'editor, coerente con i pannelli dell'app. */
const theme = EditorView.theme({
  '&': {
    color: 'var(--sf-text)',
    backgroundColor: 'var(--sf-surface)',
    fontSize: '14px',
    border: '1px solid var(--sf-border)',
    borderRadius: '14px',
    overflow: 'hidden',
  },
  '&.cm-focused': { outline: '2px solid var(--sf-accent-fill)', outlineOffset: '1px' },
  '.cm-content': { fontFamily: 'var(--sf-font-mono)', padding: '10px 0', minHeight: '180px' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--sf-text-muted)',
    border: 'none',
    fontFamily: 'var(--sf-font-mono)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--sf-border) 40%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--sf-accent-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--sf-accent-fill) 30%, transparent) !important',
  },
});

/** Opzioni dell'editor. */
export interface PythonEditorOptions {
  /** Testo iniziale. */
  readonly doc: string;
  /** Nonce della CSP: CodeMirror inserisce i suoi stili con un tag `<style>`. */
  readonly nonce: string | null;
  /** Etichetta accessibile dell'area di testo. */
  readonly label: string;
  /** Testo mostrato quando l'editor è vuoto. */
  readonly placeholder: string;
  /** Chiamata a ogni modifica, con il testo intero. */
  readonly onChange: (value: string) => void;
}

/**
 * Crea l'editor dentro `parent`.
 *
 * @param parent - Elemento che lo contiene.
 * @param options - Opzioni.
 * @returns L'editor; `destroy()` lo smonta.
 */
export function createPythonEditor(parent: HTMLElement, options: PythonEditorOptions): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        ...(options.nonce ? [EditorView.cspNonce.of(options.nonce)] : []),
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        indentOnInput(),
        bracketMatching(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        python(),
        syntaxHighlighting(highlight),
        placeholder(options.placeholder),
        // Tab indenta (come in un editor di codice); Esc e poi Tab escono dall'editor.
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.contentAttributes.of({
          'aria-label': options.label,
          autocapitalize: 'off',
          autocorrect: 'off',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
        }),
        theme,
      ],
    }),
  });
}
