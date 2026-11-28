// @ts-check
import { featureBoundaries } from '@epicfeed/config/boundaries';
import { createConfig } from '@epicfeed/config/eslint';

/** Confini del pacchetto `assistant` (ADR 0019). */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: featureBoundaries(),
});
