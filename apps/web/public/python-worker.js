/* global self, importScripts, loadPyodide */
/*
 * Worker che esegue i test del codice degli esercizi d'esame (M4, ADR 0014
 * §5). Scritto a mano, senza dipendenze oltre a Pyodide, che arriva dal
 * nostro dominio (`/pyodide/<versione>/`, copiato al build dal pacchetto npm).
 *
 * Protocollo con la pagina (`src/features/exam/python-runner.ts`):
 * - `{ type: 'init', base }` → carica Pyodide e risponde `ready` o `failed`;
 * - `{ type: 'run', id, code, calls }` → esegue il codice e ogni chiamata,
 *   risponde `{ type: 'result', id, results, stdout, setupError }`.
 *
 * Sicurezza: il worker non vede la pagina; dopo il caricamento si tolgono
 * gli strumenti di rete e il modulo `js` di Pyodide, così il codice dello
 * studente non può fare richieste. Il tempo massimo lo controlla la pagina,
 * che termina il worker.
 */

/** Limite dell'output di `print` restituito alla pagina. */
const OUTPUT_LIMIT = 4000;

/** Esecuzione in Python: un solo namespace per il codice, poi `repr()` di ogni chiamata. */
const HARNESS = `
import io, json, sys

def _ef_error(exc):
    text = f"{type(exc).__name__}: {exc}"
    return text[:300]

def _ef_run(code, calls_json):
    calls = json.loads(calls_json)
    out = io.StringIO()
    saved = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    namespace = {"__name__": "__main__"}
    results = []
    setup_error = None
    try:
        try:
            exec(compile(code, "<answer>", "exec"), namespace)
        except BaseException as exc:
            setup_error = _ef_error(exc)
        for call in calls:
            if setup_error is not None:
                results.append({"actual": None, "error": setup_error})
                continue
            try:
                value = eval(compile(call, "<test>", "eval"), namespace)
                results.append({"actual": repr(value), "error": None})
            except BaseException as exc:
                results.append({"actual": None, "error": _ef_error(exc)})
    finally:
        sys.stdout, sys.stderr = saved
    return json.dumps({"results": results, "stdout": out.getvalue()[:${OUTPUT_LIMIT}], "setupError": setup_error})

# Il codice dello studente non deve poter usare il ponte verso JavaScript (rete compresa).
for _name in ("js", "pyodide_js", "pyodide.http"):
    sys.modules[_name] = None
`;

let pyodide = null;

/** Toglie dal worker ciò che permetterebbe richieste di rete. */
function lockDown() {
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
    try {
      self[name] = undefined;
    } catch {
      // Proprietà non scrivibile: resta, ma il modulo `js` è comunque bloccato.
    }
  }
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message && message.type === 'init') {
    try {
      importScripts(`${message.base}pyodide.js`);
      pyodide = await loadPyodide({ indexURL: message.base });
      pyodide.runPython(HARNESS);
      lockDown();
      self.postMessage({ type: 'ready' });
    } catch {
      self.postMessage({ type: 'failed' });
    }
    return;
  }
  if (message && message.type === 'run' && pyodide) {
    const run = pyodide.globals.get('_ef_run');
    try {
      const json = run(String(message.code), JSON.stringify(message.calls || []));
      self.postMessage({ type: 'result', id: message.id, ...JSON.parse(json) });
    } finally {
      run.destroy();
    }
  }
};
