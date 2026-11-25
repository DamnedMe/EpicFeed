import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Dove si trova sul PC una presentazione importata. */
export interface StoredDeck {
  readonly number: number;
  /** Zip o cartella da cui è stata importata. */
  readonly source: string;
  /** Voce dentro lo zip, o percorso del file nella cartella. */
  readonly entry: string;
}

type Index = Record<string, { readonly decks: readonly StoredDeck[]; readonly importedAt: string }>;

/**
 * Cartella dei dati locali del server MCP: `%APPDATA%\EpicFeed` su Windows,
 * `~/Library/Application Support/EpicFeed` su macOS, `~/.config/epicfeed`
 * altrove. `EPICFEED_DATA_DIR` la sostituisce (prove).
 *
 * @param env - Variabili d'ambiente.
 * @param platform - Sistema operativo.
 * @returns Il percorso della cartella.
 */
export function defaultDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.EPICFEED_DATA_DIR) return env.EPICFEED_DATA_DIR;
  if (platform === 'win32')
    return join(env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'EpicFeed');
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'EpicFeed');
  return join(homedir(), '.config', 'epicfeed');
}

/**
 * Indice locale delle slide importate: per ogni lezione, dove sono i suoi PDF
 * sul PC. Serve a `leggi_lezione` per disegnare le figure durante la
 * generazione senza chiedere di nuovo lo zip. Contiene solo id di lezioni e
 * percorsi, nessun contenuto e nessun segreto.
 */
export class SlidesIndex {
  private readonly file: string;

  /**
   * @param dataDir - Cartella dei dati locali.
   */
  constructor(dataDir: string) {
    this.file = join(dataDir, 'slides.json');
  }

  /**
   * @param lessonId - Lezione.
   * @returns Le presentazioni della lezione, o una lista vuota.
   */
  async get(lessonId: string): Promise<readonly StoredDeck[]> {
    return (await this.load())[lessonId.toLowerCase()]?.decks ?? [];
  }

  /**
   * Registra le presentazioni di più lezioni in una sola scrittura.
   *
   * @param entries - Presentazioni per lezione.
   * @param now - Data dell'import.
   */
  async setMany(
    entries: ReadonlyMap<string, readonly StoredDeck[]>,
    now = new Date(),
  ): Promise<void> {
    const index = await this.load();
    for (const [lessonId, decks] of entries) {
      index[lessonId.toLowerCase()] = { decks, importedAt: now.toISOString() };
    }
    await mkdir(dirname(this.file), { recursive: true });
    // Scrittura atomica: un file a metà non deve mai sostituire quello buono.
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(index, null, 2), 'utf8');
    await rename(temp, this.file);
  }

  private async load(): Promise<Index> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      return parsed !== null && typeof parsed === 'object' ? (parsed as Index) : {};
    } catch {
      return {};
    }
  }
}
