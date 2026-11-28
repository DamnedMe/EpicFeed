// Crea la pagina della scheda del quiz al volo (app MCP): un solo file HTML
// con stile e script dentro, perché Claude Desktop la carica come risorsa
// `ui://` senza altri file accanto.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const view = new URL('../view/quiz/', import.meta.url);

/**
 * Compila `view/quiz/` in un HTML autonomo.
 *
 * @param {string} outFile - Dove scrivere la pagina.
 */
export async function buildQuizView(outFile) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('main.ts', view))],
    bundle: true,
    write: false,
    platform: 'browser',
    target: 'es2022',
    format: 'esm',
    minify: true,
    legalComments: 'none',
  });
  const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
  const styles = readFileSync(new URL('styles.css', view), 'utf8');
  const html = readFileSync(new URL('index.html', view), 'utf8')
    .replace('/*__STYLES__*/', () => styles)
    .replace('/*__SCRIPT__*/', () => script);
  writeFileSync(outFile, html);
}
