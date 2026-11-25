// @ts-check
import globals from 'globals';
import { createConfig } from '@epicfeed/config/eslint';

/** ESLint dell'estensione: regole condivise + globali del browser e di WXT. */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [
    { ignores: ['.wxt/**', '.output/**'] },
    {
      languageOptions: {
        globals: {
          ...globals.browser,
          defineBackground: 'readonly',
          defineContentScript: 'readonly',
          browser: 'readonly',
        },
      },
    },
    { files: ['src/entrypoints/**'], rules: { 'jsdoc/require-jsdoc': 'off' } },
  ],
});
