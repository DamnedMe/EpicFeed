import type { CodeTest, CodeTestOutcome } from '@epicfeed/exam';

/**
 * Esecuzione dei test del codice nel browser (M4, ADR 0014 §5): Python con
 * Pyodide dentro un Web Worker (`public/python-worker.js`), senza accesso alla
 * pagina né alla rete. Pyodide è servito dal nostro dominio (ADR 0017,
 * scelta 5) e si scarica solo al primo uso.
 */

/** Versione di Pyodide copiata in `public/pyodide/<versione>/` dallo script di build. */
export const PYODIDE_VERSION = '0.29.5';
/** Cartella dei file di Pyodide. */
export const PYODIDE_BASE = `/pyodide/${PYODIDE_VERSION}/`;
/** Tempo massimo per ogni test: oltre, il worker si interrompe (ciclo infinito?). */
export const TEST_TIMEOUT_MS = 5000;
/** Tempo massimo per scaricare e avviare Pyodide (circa 10 MB la prima volta). */
export const LOAD_TIMEOUT_MS = 90_000;

/** Esito di un'esecuzione. */
export type RunResult =
  | {
      readonly status: 'done';
      readonly outcomes: readonly CodeTestOutcome[];
      /** Output di `print`, troncato dal worker. */
      readonly stdout: string;
      /** Errore nel codice stesso (per esempio di sintassi): nessun test può passare. */
      readonly setupError: string | null;
    }
  | { readonly status: 'timeout' }
  | { readonly status: 'unavailable' };

/** Messaggi che il worker manda alla pagina. */
type WorkerMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'failed' }
  | {
      readonly type: 'result';
      readonly id: number;
      readonly results: readonly { actual: string | null; error: string | null }[];
      readonly stdout: string;
      readonly setupError: string | null;
    };

/** Ciò che serve del Web Worker: sostituibile nei test. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** Timer sostituibili nei test. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as number);
  },
};

/**
 * Esecutore dei test Python. Tiene un solo worker, avviato al primo uso e
 * riusato; se un test supera il tempo il worker viene terminato e il
 * successivo riparte da capo.
 */
export class PythonRunner {
  private worker: WorkerLike | null = null;
  private ready: Promise<boolean> | null = null;
  private nextId = 1;

  /**
   * @param createWorker - Crea il worker (predefinito `public/python-worker.js`).
   * @param timers - Timer (predefiniti quelli del browser).
   */
  constructor(
    private readonly createWorker: () => WorkerLike = () =>
      new Worker('/python-worker.js') as unknown as WorkerLike,
    private readonly timers: Timers = browserTimers,
  ) {}

  /** `true` se Pyodide è già pronto: la prossima esecuzione non scarica niente. */
  get loaded(): boolean {
    return this.worker !== null && this.ready !== null;
  }

  /**
   * Esegue il codice e poi ogni test, confrontando il `repr()` del risultato.
   *
   * @param code - Codice dello studente.
   * @param tests - Test da eseguire.
   * @returns L'esito.
   */
  async run(code: string, tests: readonly CodeTest[]): Promise<RunResult> {
    if (!(await this.start())) return { status: 'unavailable' };
    const worker = this.worker;
    if (!worker) return { status: 'unavailable' };
    const id = this.nextId++;
    return new Promise<RunResult>((resolve) => {
      const timeout = this.timers.setTimeout(
        () => {
          this.reset();
          resolve({ status: 'timeout' });
        },
        TEST_TIMEOUT_MS * Math.max(1, tests.length),
      );
      worker.onmessage = (event) => {
        const message = event.data as WorkerMessage;
        if (message.type !== 'result' || message.id !== id) return;
        this.timers.clearTimeout(timeout);
        resolve({
          status: 'done',
          stdout: message.stdout,
          setupError: message.setupError,
          outcomes: tests.map((test, index) => ({
            call: test.call,
            expected: test.expected,
            actual: message.results[index]?.actual ?? null,
            error:
              message.results[index]?.error ?? (message.setupError ? message.setupError : null),
          })),
        });
      };
      worker.onerror = () => {
        this.timers.clearTimeout(timeout);
        this.reset();
        resolve({ status: 'unavailable' });
      };
      worker.postMessage({ type: 'run', id, code, calls: tests.map((test) => test.call) });
    });
  }

  /** Termina il worker (all'uscita dalla schermata). */
  dispose(): void {
    this.reset();
  }

  /** Avvia il worker e Pyodide, una volta sola. */
  private start(): Promise<boolean> {
    if (this.ready) return this.ready;
    let worker: WorkerLike;
    try {
      worker = this.createWorker();
    } catch {
      return Promise.resolve(false);
    }
    this.worker = worker;
    this.ready = new Promise<boolean>((resolve) => {
      const timeout = this.timers.setTimeout(() => {
        this.reset();
        resolve(false);
      }, LOAD_TIMEOUT_MS);
      const done = (ok: boolean) => {
        this.timers.clearTimeout(timeout);
        if (!ok) this.reset();
        resolve(ok);
      };
      worker.onmessage = (event) => {
        const message = event.data as WorkerMessage;
        if (message.type === 'ready') done(true);
        if (message.type === 'failed') done(false);
      };
      worker.onerror = () => {
        done(false);
      };
      worker.postMessage({ type: 'init', base: PYODIDE_BASE });
    });
    return this.ready;
  }

  private reset(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}
