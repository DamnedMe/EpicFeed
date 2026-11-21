// Crea il pacchetto del server per Claude Desktop in `bundle/`:
// un solo file JavaScript con tutte le dipendenze (SDK MCP, zod, core,
// contratti), così il pacchetto .mcpb non porta node_modules.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('bundle/', root);
mkdirSync(new URL('server/', out), { recursive: true });

await build({
  entryPoints: [new URL('src/main.ts', root).pathname],
  outfile: new URL('server/index.js', out).pathname,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: false,
  legalComments: 'linked',
  // Alcune dipendenze CommonJS usano `require`: lo forniamo nel modulo ESM.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

// Manifest con la versione del pacchetto, e icona.
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
manifest.version = pkg.version;
writeFileSync(new URL('manifest.json', out), `${JSON.stringify(manifest, null, 2)}\n`);
cpSync(new URL('icon.png', root), new URL('icon.png', out));
console.log('Pacchetto pronto in apps/mcp/bundle/');
