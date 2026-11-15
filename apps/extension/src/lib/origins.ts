/** Origine della web app di produzione (impostabile al build con `WXT_APP_ORIGIN`). */
export const APP_ORIGIN: string =
  (import.meta.env.WXT_APP_ORIGIN as string | undefined) ?? 'https://study-feed.vercel.app';

/**
 * Origini da cui l'estensione accetta il collegamento e verso cui invia gli
 * import. `localhost:3000` solo nella build di sviluppo.
 */
export const APP_ORIGINS: readonly string[] = import.meta.env.DEV
  ? [APP_ORIGIN, 'http://localhost:3000']
  : [APP_ORIGIN];
