// Impacchetta `bundle/` in `epicfeed.mcpb` con lo strumento ufficiale
// (@anthropic-ai/mcpb), che valida anche il manifest. Va lanciato dopo
// `pnpm build`; non serve in CI.
//
// Prima aggiunge i binari di @napi-rs/canvas per i sistemi di Claude Desktop
// (Windows e macOS), scaricati dal registro npm con la stessa versione
// installata, e toglie quelli degli altri sistemi.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const napi = join(root, 'bundle/server/node_modules/@napi-rs');
const version = JSON.parse(readFileSync(join(napi, 'canvas/package.json'), 'utf8')).version;
const PLATFORMS = ['win32-x64-msvc', 'darwin-arm64', 'darwin-x64'];

for (const name of readdirSync(napi)) {
  const platform = name.replace(/^canvas-/, '');
  if (name !== 'canvas' && !PLATFORMS.includes(platform)) {
    rmSync(join(napi, name), { recursive: true, force: true });
  }
}
for (const platform of PLATFORMS) {
  const dest = join(napi, `canvas-${platform}`);
  if (existsSync(dest)) continue;
  const temp = mkdtempSync(join(tmpdir(), 'epicfeed-canvas-'));
  execFileSync(
    'npm',
    ['pack', `@napi-rs/canvas-${platform}@${version}`, '--pack-destination', temp, '--silent'],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const [tarball] = readdirSync(temp).filter((file) => file.endsWith('.tgz'));
  mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', join(temp, tarball), '-C', dest, '--strip-components=1']);
  rmSync(temp, { recursive: true, force: true });
  console.log(`Aggiunto @napi-rs/canvas-${platform}@${version}`);
}

execFileSync('npx', ['--yes', '@anthropic-ai/mcpb@2.1.2', 'pack', 'bundle', 'epicfeed.mcpb'], {
  cwd: root,
  stdio: 'inherit',
});
