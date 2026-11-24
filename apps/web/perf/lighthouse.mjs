// Budget di Lighthouse sul telefono (M4, ADR 0004): misura le pagine
// principali con la configurazione mobile di Lighthouse (Moto G Power
// emulato, rete 4G lenta e CPU rallentata 4 volte) e fallisce se una metrica
// supera il budget.
//
// Il rallentamento è applicato davvero al browser (`devtools`), non stimato
// (`simulate`): la stima conta nel tempo del LCP ogni richiesta partita prima
// di lui, anche gli script che non lo bloccano, e su pagine come queste (testo
// con font propri, script caricati dopo) lo gonfia di circa un secondo.
//
// Pagine misurate:
// - `/login` dal vero server di produzione (`next start`, senza Supabase);
// - il feed e il Ripasso dal banco di prova di Playwright (stesso codice e
//   stessi CSS della build, dati di prova al posto dell'API), perché le
//   pagine protette richiedono una sessione.
//
// Uso: `pnpm build && pnpm --filter @epicfeed/web perf` (costruisce da sé il
// banco di prova). Ogni pagina si misura 3 volte e vale la mediana.
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const harness = join(app, 'e2e', '.harness');

/** Budget predefinito (millisecondi, CLS senza unità). */
export const BUDGET = {
  /** Largest Contentful Paint: obiettivo dell'MVP sul telefono. */
  lcp: 2500,
  /** Total Blocking Time: l'app risponde subito ai gesti. */
  tbt: 300,
  /** Cumulative Layout Shift: niente salti mentre la pagina si carica. */
  cls: 0.1,
};

const RUNS = 3;
const NEXT_PORT = 3100;
const HARNESS_PORT = 3101;

/** Stessa CSP del banco di prova di Playwright (stili solo con il nonce). */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'nonce-e2e-nonce'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'";
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};
const PAGES = { '/': 'index.html', '/review': 'review.html', '/profile': 'profile.html' };

/**
 * File della pagina per un indirizzo, come la sceglierebbe il server dai
 * cookie del dispositivo: senza copia della materia il feed ha l'anteprima,
 * senza chiave il Ripasso chiede la password.
 */
function pageFile(path, cookie) {
  const has = (name) => new RegExp(`(^|; )${name}=1`).test(cookie);
  if (path === '/' && has('ef-feed-copy')) return 'index-copy.html';
  if (path === '/review' && has('ef-sync-key')) return 'review-key.html';
  return PAGES[path] ?? path;
}

const PAGES_TO_MEASURE = [
  { name: 'Accedi (server di produzione)', url: `http://localhost:${NEXT_PORT}/login` },
  // Prima apertura in assoluto (cache vuota): la prima schermata arriva già
  // disegnata dal server, gli script la idratano dopo.
  { name: 'Feed, prima apertura', url: `http://localhost:${HARNESS_PORT}/` },
  { name: 'Ripasso, prima apertura', url: `http://localhost:${HARNESS_PORT}/review` },
  { name: 'Feed, visita di ritorno', url: `http://localhost:${HARNESS_PORT}/`, warm: true },
  {
    name: 'Ripasso, visita di ritorno',
    url: `http://localhost:${HARNESS_PORT}/review`,
    warm: true,
  },
];

/** Avvia un processo e restituisce una funzione per fermarlo. */
function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: app, stdio: 'inherit', ...options });
  return child;
}

/** Aspetta che un indirizzo risponda (al massimo 60 secondi). */
async function waitFor(url) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // Non ancora pronto.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} non risponde`);
}

/** Server statico del banco di prova, compresso come lo servirebbe Vercel. */
function serveHarness() {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://x').pathname;
    const file = normalize(join(harness, pageFile(path, request.headers.cookie ?? '')));
    if (!file.startsWith(harness) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const body = readFileSync(file);
    const compress = /text|javascript|json/.test(type);
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Security-Policy': CSP,
      // File con l'impronta nel nome: in cache per sempre, come su Vercel.
      'Cache-Control': /^\/(_next|chunks)\//.test(path)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      ...(compress ? { 'Content-Encoding': 'gzip' } : {}),
    });
    response.end(compress ? gzipSync(body) : body);
  });
  return new Promise((resolve) => server.listen(HARNESS_PORT, () => resolve(server)));
}

/** Mediana di un elenco di numeri. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Esegue `task` con un Chrome nuovo, chiuso alla fine. Lighthouse svuota cache
 * e dati del sito ma non i cookie: per una vera prima apertura serve un
 * profilo pulito.
 */
async function withChrome(task) {
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  try {
    return await task(chrome.port);
  } finally {
    await chrome.kill();
  }
}

/** Una misura di Lighthouse con il Chrome sulla porta indicata. */
async function lighthouseRun(url, port, warm) {
  const result = await lighthouse(url, {
    port,
    disableStorageReset: warm,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
    throttlingMethod: 'devtools',
  });
  if (!result) throw new Error(`Lighthouse non ha misurato ${url}`);
  const { audits, categories, runtimeError } = result.lhr;
  if (runtimeError) throw new Error(`${url}: ${runtimeError.message}`);
  return {
    score: categories.performance.score ?? 0,
    lcp: audits['largest-contentful-paint'].numericValue ?? Infinity,
    tbt: audits['total-blocking-time'].numericValue ?? Infinity,
    cls: audits['cumulative-layout-shift'].numericValue ?? Infinity,
  };
}

/** Misura una pagina più volte e restituisce le mediane. */
async function measure(url, warm) {
  const runs = [];
  if (warm) {
    // Visita di ritorno: una prima apertura riempie cache e dati sul dispositivo.
    await withChrome(async (port) => {
      await lighthouseRun(url, port, false);
      for (let i = 0; i < RUNS; i += 1) runs.push(await lighthouseRun(url, port, true));
    });
  } else {
    for (let i = 0; i < RUNS; i += 1) {
      runs.push(await withChrome((port) => lighthouseRun(url, port, false)));
    }
  }
  return {
    score: median(runs.map((r) => r.score)),
    lcp: median(runs.map((r) => r.lcp)),
    tbt: median(runs.map((r) => r.tbt)),
    cls: median(runs.map((r) => r.cls)),
  };
}

if (!existsSync(join(app, '.next', 'BUILD_ID'))) {
  console.error('Manca la build di Next.js: esegui prima `pnpm build`.');
  process.exit(1);
}
await new Promise((resolve, reject) => {
  run('node', ['e2e/harness/build.mjs']).on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error('banco di prova non costruito')),
  );
});

// Configurazione finta ma valida: `/login` non usa il database né Supabase
// finché non si invia il modulo; senza sessione il proxy non chiama la rete.
const next = run('pnpm', ['exec', 'next', 'start', '-p', String(NEXT_PORT)], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_lighthouse',
    DATABASE_URL: 'postgres://lighthouse:lighthouse@127.0.0.1:9/lighthouse',
    ALLOWED_EMAILS: 'lighthouse@example.com',
  },
});
const static_ = await serveHarness();

let failed = false;
const summary = [];
try {
  await waitFor(`http://localhost:${NEXT_PORT}/login`);
  for (const page of PAGES_TO_MEASURE) {
    const m = await measure(page.url, page.warm === true);
    const over = [
      m.lcp > BUDGET.lcp && `LCP ${Math.round(m.lcp)} ms > ${BUDGET.lcp}`,
      m.tbt > BUDGET.tbt && `TBT ${Math.round(m.tbt)} ms > ${BUDGET.tbt}`,
      m.cls > BUDGET.cls && `CLS ${m.cls.toFixed(3)} > ${BUDGET.cls}`,
    ].filter(Boolean);
    failed ||= over.length > 0;
    summary.push({ page: page.name, ...m, budget: BUDGET, over });
    console.log(
      `${over.length ? '✗' : '✓'} ${page.name}: punteggio ${Math.round(m.score * 100)}, LCP ${Math.round(m.lcp)} ms, TBT ${Math.round(m.tbt)} ms, CLS ${m.cls.toFixed(3)}${over.length ? ` — fuori budget: ${over.join(', ')}` : ''}`,
    );
  }
} finally {
  static_.close();
  next.kill();
}

mkdirSync(join(app, 'perf', '.results'), { recursive: true });
writeFileSync(
  join(app, 'perf', '.results', 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);
process.exit(failed ? 1 : 0);
