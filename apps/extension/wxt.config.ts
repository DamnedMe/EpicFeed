import { defineConfig } from 'wxt';

/**
 * Configurazione dell'estensione (WXT, Manifest V3).
 *
 * Permessi minimi:
 * - `storage`: il token di import e l'indirizzo dell'app, solo in locale;
 * - host: il portale (lettura della lezione), il CMS Directus (solo GET con i
 *   campi necessari), il player e i sottotitoli di Vimeo, e l'API di EpicFeed.
 *
 * `externally_connectable`: solo la web app di EpicFeed può inviare il
 * token di collegamento all'estensione.
 *
 * `key`: chiave pubblica che fissa l'id dell'estensione
 * (`bchcghaegcogobjapblaanbpnkpkihdd`), così la web app sa a chi inviare il
 * token anche con l'estensione caricata "non pacchettizzata". È pubblica per
 * natura: la chiave privata non serve e non esiste nella repo.
 */
const appOrigin = process.env.WXT_APP_ORIGIN ?? 'https://study-feed.vercel.app';

export default defineConfig({
  srcDir: 'src',
  manifest: ({ mode }) => {
    // La web app in locale è ammessa solo nella build di sviluppo.
    const origins = mode === 'development' ? [appOrigin, 'http://localhost:3000'] : [appOrigin];
    return {
      name: 'EpicFeed',
      description: 'Importa in EpicFeed la lezione Epicode che stai guardando.',
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqk/b9YKSPqoDwko+JUiF0eKx2RFK28dLes6ajPZwoleqcGhhompLv6yJVmmt+HPQAnE7sE9VVLsr/MaEUUYkJ2geMSHLsDH8STxriHjjBdUwRY7klM17R05VV4/4TE+ScbQFuf3XG/7mQQUypBQkcGFX26YQC70b3dfmFua4HPthVByKKAf5CahOtKb1aQ6pOPNsDGs26warK60an1dIiyAhuzpo8Jq1Qfxt1YseZca71Q/A2TwfRzynA5+WuvzYg9oKKaZOFLRL5HFd6my2uDieYQQrvHE8mQrIkuSp55i+VwrvMvsz8UnqP01Z0v2tOlb4+AH2C14ltljyuzUB+QIDAQAB',
      permissions: ['storage'],
      host_permissions: [
        'https://learn.epicode.edu.mt/*',
        'https://cms.epicode.edu.mt/*',
        'https://player.vimeo.com/*',
        'https://captions.vimeo.com/*',
        ...origins.map((origin) => `${origin}/*`),
      ],
      externally_connectable: { matches: origins.map((origin) => `${origin}/*`) },
      action: { default_title: 'EpicFeed: importa la lezione' },
    };
  },
});
