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
import { fileURLToPath } from 'node:url';

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

await build({
  entryPoints: {
    app: join(here, 'entry.tsx'),
    io: join(here, 'io-entry.tsx'),
    review: join(here, 'review-entry.tsx'),
  },
  bundle: true,
  outdir: out,
  plugins: [serverActions],
  jsx: 'automatic',
  alias: {
    '@': join(app, 'src'),
    'next/link': join(here, 'next-link.tsx'),
    'next/navigation': join(here, 'next-navigation.ts'),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
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
const page = (script) =>
  `<!doctype html><html lang="it" data-theme="dark" data-accent="racing-red" class="ef-fonts ${fontClasses.join(' ')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${links}</head><body class="min-h-dvh bg-background text-text"><div id="root"></div><script src="/${script}.js"></script></body></html>`;
// Worker dei test Python e Pyodide (copiato da `pnpm build` in public/pyodide).
cpSync(join(app, 'public', 'python-worker.js'), join(out, 'python-worker.js'));
cpSync(join(app, 'public', 'pyodide'), join(out, 'pyodide'), { recursive: true });
writeFileSync(join(out, 'index.html'), page('app'));
writeFileSync(join(out, 'io.html'), page('io'));
writeFileSync(join(out, 'ripasso.html'), page('review'));
console.log(`Banco di prova pronto in ${out}`);
