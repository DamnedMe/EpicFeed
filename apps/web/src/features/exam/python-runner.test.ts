import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Timers, WorkerLike } from './python-runner';
import { PYODIDE_VERSION, PythonRunner, TEST_TIMEOUT_MS } from './python-runner';

/** Worker finto: registra i messaggi e risponde come quello vero. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: unknown[] = [];
  terminated = false;
  constructor(private readonly reply: (message: { type: string; id?: number }) => unknown) {}
  postMessage(message: unknown): void {
    this.sent.push(message);
    const answer = this.reply(message as { type: string; id?: number });
    if (answer) queueMicrotask(() => this.onmessage?.({ data: answer }));
  }
  terminate(): void {
    this.terminated = true;
  }
}

/** Timer manuali: `fire()` fa scadere quelli in attesa. */
function manualTimers(): Timers & { fire: () => void; delays: number[] } {
  const pending = new Map<number, () => void>();
  const delays: number[] = [];
  let next = 1;
  return {
    delays,
    setTimeout: (callback, ms) => {
      delays.push(ms);
      pending.set(next, callback);
      return next++;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
    fire: () => {
      for (const callback of [...pending.values()]) callback();
      pending.clear();
    },
  };
}

const tests = [
  { call: 'f(1)', expected: '2' },
  { call: 'f(2)', expected: '4' },
];

describe('PythonRunner', () => {
  it('avvia Pyodide una volta e associa i risultati ai test', async () => {
    const workers: FakeWorker[] = [];
    const runner = new PythonRunner(() => {
      const worker = new FakeWorker((message) =>
        message.type === 'init'
          ? { type: 'ready' }
          : {
              type: 'result',
              id: message.id,
              results: [
                { actual: '2', error: null },
                { actual: null, error: 'ZeroDivisionError: division by zero' },
              ],
              stdout: 'hi\n',
              setupError: null,
            },
      );
      workers.push(worker);
      return worker;
    }, manualTimers());

    const first = await runner.run('def f(x): ...', tests);
    expect(first).toEqual({
      status: 'done',
      stdout: 'hi\n',
      setupError: null,
      outcomes: [
        { call: 'f(1)', expected: '2', actual: '2', error: null },
        { call: 'f(2)', expected: '4', actual: null, error: 'ZeroDivisionError: division by zero' },
      ],
    });
    await runner.run('def f(x): ...', tests);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.sent[0]).toEqual({ type: 'init', base: `/pyodide/${PYODIDE_VERSION}/` });
  });

  it('oltre il tempo termina il worker e il successivo riparte', async () => {
    const timers = manualTimers();
    const workers: FakeWorker[] = [];
    const runner = new PythonRunner(() => {
      // Pronto, ma non risponde mai all'esecuzione (ciclo infinito).
      const worker = new FakeWorker((message) =>
        message.type === 'init' ? { type: 'ready' } : null,
      );
      workers.push(worker);
      return worker;
    }, timers);

    const pending = runner.run('while True: pass', tests);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(timers.delays.at(-1)).toBe(TEST_TIMEOUT_MS * tests.length);
    timers.fire();
    expect(await pending).toEqual({ status: 'timeout' });
    expect(workers[0]?.terminated).toBe(true);

    void runner.run('x = 1', tests);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(workers).toHaveLength(2);
  });

  it('se Pyodide non si carica, l’esecuzione non è disponibile', async () => {
    const runner = new PythonRunner(
      () => new FakeWorker(() => ({ type: 'failed' })),
      manualTimers(),
    );
    expect(await runner.run('x', tests)).toEqual({ status: 'unavailable' });
    const broken = new PythonRunner(() => {
      throw new Error('no workers');
    }, manualTimers());
    expect(await broken.run('x', tests)).toEqual({ status: 'unavailable' });
  });

  it('la versione coincide con il pacchetto copiato al build', () => {
    const require = createRequire(import.meta.url);
    const pkg = JSON.parse(readFileSync(require.resolve('pyodide/package.json'), 'utf8')) as {
      version: string;
    };
    expect(PYODIDE_VERSION).toBe(pkg.version);
  });
});
