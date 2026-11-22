// Processo principale di Electron per la prova: avvia lo script indicato in
// un "utility process" (come Claude Desktop fa con i server MCP) e ne
// restituisce il codice di uscita.
// Uso: electron electron-main.mjs <script> [argomenti…]
import { app, utilityProcess } from 'electron';

const separator = process.argv.findIndex((arg) => arg.endsWith('electron-main.mjs'));
const [script, ...args] = process.argv.slice(separator + 1);

// Niente `await` di primo livello: nel processo principale ritarderebbe
// l'evento "ready" di Electron.
void app.whenReady().then(() => {
  const child = utilityProcess.fork(script, args, { stdio: 'inherit' });
  child.on('exit', (code) => {
    app.exit(code);
  });
});
