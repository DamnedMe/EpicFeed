// Prova il pacchetto `.mcpb` dentro Electron, come lo usa Claude Desktop.
//
// Uso: node run.mjs <epicfeed.mcpb | cartella bundle> <cartella con node_modules/electron>
//
// 1. estrae il pacchetto (o copia la cartella `bundle/`, utile su Linux, dove
//    il `.mcpb` non ha il binario di @napi-rs/canvas) in una cartella con
//    spazi nel nome (come "Claude Extensions" sotto il profilo utente);
// 2. copia `server-smoke.mjs` accanto a `server/index.js`;
// 3. lo avvia in un utility process di Electron con lo zip di prova;
// 4. stampa il risultato ed esce con 0 solo se la prova è riuscita.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [mcpb, electronDir] = process.argv.slice(2).map((arg) => resolve(arg));
if (!mcpb || !electronDir) {
  console.error('Uso: node run.mjs <epicfeed.mcpb> <cartella con node_modules/electron>');
  process.exit(2);
}

const extensionDir = join(mkdtempSync(join(tmpdir(), 'Claude Extensions ')), 'epicfeed smoke');
mkdirSync(extensionDir, { recursive: true });
if (statSync(mcpb).isDirectory()) {
  cpSync(mcpb, extensionDir, { recursive: true });
} else {
  // Il tar di Windows (bsdtar, in System32) apre anche gli zip; quello di
  // Git Bash no, e scambia "D:" per un host remoto. Su Linux serve unzip.
  const windowsTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const unpack =
    process.platform === 'win32'
      ? spawnSync(windowsTar, ['-xf', mcpb, '-C', extensionDir], { stdio: 'inherit' })
      : spawnSync('unzip', ['-q', mcpb, '-d', extensionDir], { stdio: 'inherit' });
  if (unpack.status !== 0) throw new Error('Non riesco a estrarre il pacchetto.');
}
copyFileSync(join(here, 'server-smoke.mjs'), join(extensionDir, 'server', 'server-smoke.mjs'));

/** @type {string} */
const electron = createRequire(join(electronDir, 'package.json'))('electron');
const resultPath = join(extensionDir, 'risultato.json');
const electronArgs = [
  join(here, 'electron-main.mjs'),
  join(extensionDir, 'server', 'server-smoke.mjs'),
  join(here, 'course-downloads.zip'),
  resultPath,
];
const headless = process.platform === 'linux' && !process.env.DISPLAY;
const run = headless
  ? spawnSync('xvfb-run', ['-a', electron, '--no-sandbox', ...electronArgs], { stdio: 'inherit' })
  : spawnSync(electron, electronArgs, { stdio: 'inherit', timeout: 120_000 });

if (!existsSync(resultPath)) {
  console.error(`Nessun risultato (uscita di Electron: ${String(run.status)}).`);
  process.exit(1);
}
const result = JSON.parse(readFileSync(resultPath, 'utf8'));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok === true && run.status === 0 ? 0 : 1);
