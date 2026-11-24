/**
 * pdfjs-dist non pubblica i tipi del worker: qui basta sapere che è un modulo.
 * Serve solo per caricarlo nello stesso processo (vedi `importPdfJsAsNode`).
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
