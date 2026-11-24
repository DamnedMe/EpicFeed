// Copia i file di Pyodide dal pacchetto npm in `public/pyodide/<versione>/`
// (ADR 0017, scelta 5: Pyodide servito dal nostro dominio, niente CDN).
// Gira prima di `next dev` e `next build`; la cartella non va in git.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pyodide/package.json'));
const { version } = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
const root = join(here, '..', 'public', 'pyodide');
const target = join(root, version);

/** Solo ciò che serve a caricare Python con la libreria standard (niente console né mappe). */
const FILES = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

if (FILES.every((file) => existsSync(join(target, file)))) {
  console.log(`Pyodide ${version} già presente.`);
} else {
  // Le versioni vecchie non servono più: la cartella contiene solo quella corrente.
  rmSync(root, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const file of FILES) copyFileSync(join(source, file), join(target, file));
  console.log(`Pyodide ${version} copiato in public/pyodide/${version}/.`);
}
