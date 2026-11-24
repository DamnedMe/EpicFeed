// @ts-check
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { createConfig } from '@epicfeed/config/eslint';

/**
 * ESLint della web app: regole condivise + Next.js + hook di React.
 * La logica di business sta nel core: qui solo composizione e presentazione
 * (ADR 0004), quindi la web app non importa lo schema del database
 * direttamente nei componenti.
 */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [
    {
      ignores: [
        '.next/**',
        'e2e/.harness/**',
        // Pyodide copiato al build dal pacchetto npm (scripts/copy-pyodide.mjs).
        'public/pyodide/**',
        'test-results/**',
        'next-env.d.ts',
        'postcss.config.mjs',
      ],
    },
    {
      plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
        ...reactHooks.configs.recommended.rules,
        // I componenti React e le route non sono API di un pacchetto.
        'jsdoc/require-jsdoc': 'off',
      },
    },
    {
      files: ['src/server/**/*.ts'],
      rules: {
        'jsdoc/require-jsdoc': [
          'error',
          { publicOnly: true, require: { FunctionDeclaration: true, ClassDeclaration: true } },
        ],
      },
    },
  ],
});
