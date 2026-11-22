import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import yauzl from 'yauzl';

/** Un PDF trovato nello zip o nella cartella delle slide. */
export interface SlideFile {
  /** Nome del file, senza cartelle (`AVL trees-1.pdf`). */
  readonly fileName: string;
  /** Percorso dentro lo zip, o percorso del file nella cartella. */
  readonly entry: string;
  /**
   * Posizione della voce nello zip (da 0). Lo zip del portale elenca i PDF
   * nell'ordine del corso, e serve a distinguere lezioni con lo stesso titolo.
   * Manca per i file di una cartella, dove l'ordine originale è perso.
   */
  readonly archiveOrder?: number;
  /** Legge il contenuto del PDF. */
  read(): Promise<Uint8Array>;
}

/** Dimensione massima di un singolo PDF letto (le slide Epicode pesano 1–10 MB). */
export const MAX_PDF_BYTES = 60 * 1024 * 1024;

/** Massimo di PDF considerati in uno zip (il corso DSA ne ha 91). */
export const MAX_PDF_FILES = 500;

/**
 * Elenca i PDF di uno zip (`Download all PDFs` del portale) o di una cartella
 * in cui lo zip è stato estratto. Legge solo l'indice: il contenuto di ogni
 * PDF si legge quando serve, con {@link SlideFile.read}.
 *
 * Il server non scrive mai i file dello zip su disco: li legge in memoria.
 *
 * @param path - Percorso dello zip o della cartella, sul PC dello studente.
 * @returns I PDF trovati: nell'ordine dello zip, o per nome se è una cartella.
 * @throws Error con un messaggio leggibile se il percorso non esiste o non è
 *   uno zip valido.
 */
export async function listSlideFiles(path: string): Promise<SlideFile[]> {
  const info = await stat(path).catch(() => null);
  if (!info) throw new Error(`Non trovo "${path}" sul PC.`);
  const files = info.isDirectory()
    ? (await listFolder(path)).sort((a, b) => a.fileName.localeCompare(b.fileName))
    : await listZip(path);
  return files
    .filter((file) => !file.entry.split(/[\\/]/).some((part) => part.startsWith('__MACOSX')))
    .slice(0, MAX_PDF_FILES);
}

async function listFolder(folder: string): Promise<SlideFile[]> {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.pdf')
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return {
        fileName: entry.name,
        entry: full,
        read: async () => {
          const size = (await stat(full)).size;
          if (size > MAX_PDF_BYTES) throw new Error(`${entry.name} è troppo grande.`);
          return new Uint8Array(await readFile(full));
        },
      };
    });
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error) reject(new Error(`"${basename(zipPath)}" non è uno zip valido.`));
      else resolve(zip);
    });
  });
}

/** Elenca le voci PDF dello zip; il contenuto si legge riaprendo lo zip. */
async function listZip(zipPath: string): Promise<SlideFile[]> {
  const zip = await openZip(zipPath);
  try {
    const names = await new Promise<string[]>((resolve, reject) => {
      const found: string[] = [];
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;
        if (!name.endsWith('/') && extname(name).toLowerCase() === '.pdf') found.push(name);
        zip.readEntry();
      });
      zip.on('end', () => {
        resolve(found);
      });
      zip.on('error', () => {
        reject(new Error(`"${basename(zipPath)}" non è uno zip valido.`));
      });
      zip.readEntry();
    });
    return names.map((name, archiveOrder) => ({
      fileName: basename(name),
      entry: name,
      archiveOrder,
      read: () => readZipEntry(zipPath, name),
    }));
  } finally {
    zip.close();
  }
}

/**
 * Legge una voce dello zip in memoria, con un tetto sulla dimensione (anche se
 * lo zip dichiara una dimensione falsa).
 *
 * @param zipPath - Percorso dello zip.
 * @param name - Percorso della voce dentro lo zip.
 * @returns Il contenuto della voce.
 */
export async function readZipEntry(zipPath: string, name: string): Promise<Uint8Array> {
  const zip = await openZip(zipPath);
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      let found = false;
      zip.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName !== name) {
          zip.readEntry();
          return;
        }
        found = true;
        if (entry.uncompressedSize > MAX_PDF_BYTES) {
          reject(new Error(`${basename(name)} è troppo grande.`));
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error) {
            reject(new Error(`Non riesco a leggere ${basename(name)}.`));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_PDF_BYTES) {
              stream.destroy();
              reject(new Error(`${basename(name)} è troppo grande.`));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('end', () => {
            resolve(new Uint8Array(Buffer.concat(chunks)));
          });
          stream.on('error', () => {
            reject(new Error(`Non riesco a leggere ${basename(name)}.`));
          });
        });
      });
      zip.on('end', () => {
        if (!found) reject(new Error(`${basename(name)} non è più nello zip.`));
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}
