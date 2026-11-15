// @ts-check
/**
 * Applica le migrazioni di `migrations/` al database di `DATABASE_URL`.
 *
 * Sostituisce `drizzle-kit migrate`, che in caso di errore non stampa il
 * motivo. Qui ogni errore viene spiegato, senza mai stampare la password né
 * la stringa di connessione completa: compaiono solo host, porta e utente.
 * Le migrazioni applicate sono registrate in `drizzle.__drizzle_migrations`,
 * come fa drizzle-kit, quindi rilanciarlo applica solo quelle nuove.
 */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/** Termina con un messaggio di errore leggibile in GitHub Actions. */
function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/**
 * Valida la stringa di connessione e ne restituisce una descrizione sicura.
 * @param {string | undefined} raw
 */
function parseConnection(raw) {
  if (!raw) fail('DATABASE_URL non è impostata.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(
      'DATABASE_URL non è una stringa di connessione valida. Spesso succede se la password ' +
        'contiene caratteri speciali (@ # / : ?): reimpostala con soli lettere e numeri.',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    fail(`DATABASE_URL deve iniziare con postgresql:// (trovato ${url.protocol}//).`);
  }
  if (!url.password || /YOUR-PASSWORD/i.test(decodeURIComponent(url.password))) {
    fail(
      'Nella stringa manca la password del database: sostituisci [YOUR-PASSWORD] con la password.',
    );
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!local && !url.hostname.includes('.')) {
    // Una password con @ o # non codificati sposta l'host dentro la password.
    fail(
      // L'host qui può contenere un pezzo della password: non lo stampiamo.
      'Host non valido: probabilmente la password contiene caratteri speciali ' +
        '(@ # / : ?). Reimpostala con soli lettere e numeri e aggiorna il segreto.',
    );
  }
  const safe = `${url.username}@${url.hostname}:${url.port || '5432'}`;
  return { url: url.toString(), local, safe };
}

const connection = parseConnection(process.env.DATABASE_URL);
console.log(`Connessione a ${connection.safe}`);

// Supabase richiede connessioni cifrate verso l'esterno. `prepare: false`
// rende la connessione compatibile anche con il pooler in modalità transaction.
const client = postgres(connection.url, {
  max: 1,
  ssl: connection.local ? false : 'require',
  prepare: false,
  connect_timeout: 15,
  onnotice: () => {},
});

try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log('Migrazioni applicate (quelle già presenti sono state saltate).');
} catch (error) {
  const err =
    /** @type {{ message?: string, code?: string, cause?: { message?: string, code?: string } }} */ (
      error
    );
  const detail = err.cause?.message ?? err.message ?? String(error);
  const code = err.cause?.code ?? err.code;
  const hints = {
    '28P01': 'Password errata: controlla la password del database nella stringa.',
    XX000:
      'Utente o progetto non riconosciuto dal pooler: copia di nuovo la stringa "Session pooler" da Supabase.',
    ENOTFOUND: 'Host non trovato: copia di nuovo la stringa da Supabase.',
    ENETUNREACH:
      'Rete non raggiungibile: usa la stringa "Session pooler" invece di "Direct connection" (IPv6).',
    ETIMEDOUT:
      'Connessione scaduta: usa la stringa "Session pooler" e controlla che il progetto non sia in pausa.',
  };
  const hint = code && code in hints ? ` ${hints[/** @type {keyof typeof hints} */ (code)]}` : '';
  fail(`Migrazione non riuscita${code ? ` (${code})` : ''}: ${detail}.${hint}`);
} finally {
  await client.end({ timeout: 5 });
}
