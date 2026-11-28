// Costruisce il banco di prova in e2e/.harness: JS con esbuild, CSS dalla
// build di Next.js (`next build` deve essere già stato eseguito).
import { build } from 'esbuild';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..', '..');
const out = join(here, '..', '.harness');
const chunks = join(app, '.next', 'static', 'chunks');
if (!existsSync(chunks)) throw new Error('Manca la build di Next.js: esegui prima `pnpm build`.');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// Le server action (`saveAppearance` di Io, `confirmPassword` dello sblocco)
// qui non esistono: le si sostituisce con funzioni vuote (il tema cambia
// comunque subito sulla pagina; senza server la password non si verifica).
const serverActions = {
  name: 'server-actions',
  setup(builder) {
    builder.onResolve({ filter: /^\.\/actions$/ }, () => ({ path: 'actions', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents:
        'export async function saveAppearance() {}\n' +
        'export async function confirmPassword() { return { ok: false, email: null }; }',
      loader: 'js',
    }));
  },
};

const shared = {
  bundle: true,
  plugins: [serverActions],
  jsx: 'automatic',
  alias: {
    '@': join(app, 'src'),
    'next/link': join(here, 'next-link.tsx'),
    'next/navigation': join(here, 'next-navigation.ts'),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
};

// Prerender in Node (come il server di Next.js): l'HTML delle pagine arriva
// già disegnato e il browser lo idrata.
const prerenderFile = join(here, '..', '.harness-prerender', 'prerender.mjs');
await build({
  ...shared,
  entryPoints: [join(here, 'prerender.tsx')],
  outfile: prerenderFile,
  platform: 'node',
  format: 'esm',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
const prerender = await import(pathToFileURL(prerenderFile).href);
rmSync(dirname(prerenderFile), { recursive: true, force: true });

const result = await build({
  ...shared,
  metafile: true,
  entryPoints: {
    app: join(here, 'entry.tsx'),
    profile: join(here, 'profile-entry.tsx'),
    review: join(here, 'review-entry.tsx'),
    assistant: join(here, 'assistant-entry.tsx'),
  },
  outdir: out,
  // Come la build di produzione: il budget di Lighthouse misura anche questo banco.
  minify: true,
  // Moduli ES con i caricamenti pigri in file separati (CodeMirror), come in Next.
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
});

// Il CSS resta al suo percorso: i font li cerca con indirizzi relativi (../media).
cpSync(join(app, '.next', 'static'), join(out, '_next', 'static'), { recursive: true });
const css = readdirSync(chunks).filter((name) => name.endsWith('.css'));
const styles = css.map((name) => readFileSync(join(chunks, name), 'utf8')).join('\n');
// Classi che collegano i font ai token (`--ef-font-*`), come le mette il layout.
const fontClasses = [...styles.matchAll(/\.([\w-]+)\{--ef-font-/g)].map((m) => m[1]);
const links = css
  .map((name) => `<link rel="stylesheet" href="/_next/static/chunks/${name}">`)
  .join('');
// Come fa Next.js nella <head>: preload dei font marcati `.p.` e degli
// script importati subito dall'ingresso (niente cascata di richieste).
const fonts = readdirSync(join(app, '.next', 'static', 'media'))
  .filter((name) => name.includes('.p.') && name.endsWith('.woff2'))
  .map(
    (name) =>
      `<link rel="preload" href="/_next/static/media/${name}" as="font" type="font/woff2" crossorigin="">`,
  )
  .join('');
const outputs = result.metafile.outputs;
const preloads = (script) => {
  const entry = Object.entries(outputs).find(([, meta]) =>
    meta.entryPoint?.endsWith(`${script === 'app' ? 'entry' : `${script}-entry`}.tsx`),
  );
  return (entry?.[1].imports ?? [])
    .filter((item) => item.kind === 'import-statement')
    .map((item) => `<link rel="modulepreload" href="/${item.path.split('.harness/')[1]}">`)
    .join('');
};
// Dati dell'anteprima come li scrive la pagina del server (JSON non eseguito).
const previewScript = (data) =>
  `<script type="application/json" id="ef-preview">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const page = (script, markup = '', extra = '') =>
  `<!doctype html><html lang="it" data-theme="dark" data-accent="racing-red" class="ef-fonts ${fontClasses.join(' ')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${fonts}${links}${preloads(script)}</head><body class="min-h-dvh bg-background text-text"><div id="root">${markup}</div>${extra}<script type="module" src="/${script}.js"></script></body></html>`;
// Worker dei test Python e Pyodide (copiato da `pnpm build` in public/pyodide).
cpSync(join(app, 'public', 'python-worker.js'), join(out, 'python-worker.js'));
cpSync(join(app, 'public', 'pyodide'), join(out, 'pyodide'), { recursive: true });
// Feed alla prima apertura (prima lezione dal server) e con la copia sul dispositivo.
writeFileSync(
  join(out, 'index.html'),
  page('app', prerender.html.feed(), previewScript(prerender.preview)),
);
writeFileSync(join(out, 'index-copy.html'), page('app', prerender.html.feedWithCopy()));
writeFileSync(join(out, 'profile.html'), page('profile', prerender.html.profile()));
writeFileSync(join(out, 'assistant.html'), page('assistant', prerender.html.assistant()));
// Ripasso senza e con la chiave della sincronizzazione sul dispositivo.
writeFileSync(join(out, 'review.html'), page('review', prerender.html.review()));
writeFileSync(join(out, 'review-key.html'), page('review', prerender.html.reviewWithKey()));
console.log(`Banco di prova pronto in ${out}`);
