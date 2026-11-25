// @ts-check
import { featureBoundaries } from '@epicfeed/config/boundaries';
import { createConfig } from '@epicfeed/config/eslint';

/** Il nucleo condiviso è puro e non dipende da nessun pacchetto (ADR 0019). */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: featureBoundaries({ flat: true }),
});
