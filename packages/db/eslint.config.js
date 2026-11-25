// @ts-check
import { createConfig } from '@epicfeed/config/eslint';

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [{ files: ['test/**'], rules: { 'jsdoc/require-jsdoc': 'off' } }],
});
