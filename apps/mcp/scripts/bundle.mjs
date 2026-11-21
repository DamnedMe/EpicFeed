// Crea il pacchetto del server per Claude Desktop in `bundle/`:
// - `server/index.js`: un solo file con le dipendenze JavaScript (SDK MCP,
//   zod, core, contratti, yauzl);
// - `server/node_modules/`: solo pdf.js e @napi-rs/canvas, che non si possono
//   unire in un file (worker, font, WebAssembly e libreria nativa).
// Il binario nativo copiato qui è quello del sistema su cui si compila;
// `pnpm run pack` aggiunge quelli per Windows e macOS.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';

const root = new URL('../', import.meta.url);
const out = new URL('bundle/', root);
const serverDir = new URL('server/', out).pathname;
rmSync(out, { recursive: true, force: true });
mkdirSync(serverDir, { recursive: true });

const EXTERNAL = ['pdfjs-dist', '@napi-rs/canvas'];

await build({
  entryPoints: [new URL('src/main.ts', root).pathname],
  outfile: join(serverDir, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: false,
  legalComments: 'linked',
  external: EXTERNAL.flatMap((name) => [name, `${name}/*`]),
  // Alcune dipendenze CommonJS usano `require`: lo forniamo nel modulo ESM.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

const require = createRequire(new URL('package.json', root));
/** Cartella reale di un pacchetto installato (pnpm usa collegamenti). */
const packageDir = (name, from = require) =>
  realpathSync(dirname(from.resolve(`${name}/package.json`)));
const target = (name) => join(serverDir, 'node_modules', name);

// pdf.js: solo la build per Node e le risorse che legge dal disco.
const pdfjs = packageDir('pdfjs-dist');
for (const path of [
  'package.json',
  'LICENSE',
  'legacy/build/pdf.mjs',
  'legacy/build/pdf.worker.mjs',
  'standard_fonts',
  'cmaps',
  'wasm',
  'iccs',
]) {
  cpSync(join(pdfjs, path), join(target('pdfjs-dist'), path), { recursive: true });
}

// @napi-rs/canvas: il pacchetto JavaScript e il binario del sistema corrente.
const canvas = packageDir('@napi-rs/canvas');
cpSync(canvas, target('@napi-rs/canvas'), {
  recursive: true,
  // Niente dipendenze annidate: i binari si copiano a parte.
  filter: (path) => !relative(canvas, path).split(sep).includes('node_modules'),
});
const canvasPkg = JSON.parse(readFileSync(join(canvas, 'package.json'), 'utf8'));
const canvasRequire = createRequire(join(canvas, 'package.json'));
for (const binary of Object.keys(canvasPkg.optionalDependencies ?? {})) {
  try {
    cpSync(packageDir(binary, canvasRequire), target(binary), { recursive: true });
  } catch {
    // Binario di un altro sistema, non installato qui.
  }
}

// Manifest con la versione del pacchetto, e icona.
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
manifest.version = pkg.version;
writeFileSync(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`);
cpSync(new URL('icon.png', root), new URL('icon.png', out));
console.log('Pacchetto pronto in apps/mcp/bundle/');
