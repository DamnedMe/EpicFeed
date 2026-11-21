// Impacchetta `bundle/` in `epicfeed.mcpb` con lo strumento ufficiale
// (@anthropic-ai/mcpb), che valida anche il manifest. Va lanciato dopo
// `pnpm build`; non serve in CI.
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
execFileSync('npx', ['--yes', '@anthropic-ai/mcpb@2.1.2', 'pack', 'bundle', 'epicfeed.mcpb'], {
  cwd: root,
  stdio: 'inherit',
});
