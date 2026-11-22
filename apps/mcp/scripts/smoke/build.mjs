// Prepara in `smoke-kit/` i file della prova in Electron (vedi run.mjs):
// la prova del server unita in un file, gli script e lo zip di prova.
// Va lanciato dalla cartella apps/mcp dopo `pnpm build`.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const kit = fileURLToPath(new URL('smoke-kit/', root));
rmSync(kit, { recursive: true, force: true });
mkdirSync(kit, { recursive: true });

const EXTERNAL = ['pdfjs-dist', '@napi-rs/canvas'];
await build({
  entryPoints: [fileURLToPath(new URL('server-smoke.mjs', import.meta.url))],
  outfile: `${kit}server-smoke.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: EXTERNAL.flatMap((name) => [name, `${name}/*`]),
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
for (const file of ['electron-main.mjs', 'run.mjs']) {
  copyFileSync(new URL(file, import.meta.url), `${kit}${file}`);
}
copyFileSync(new URL('test/fixtures/course-downloads.zip', root), `${kit}course-downloads.zip`);
console.log('Prova in Electron pronta in apps/mcp/smoke-kit/');
