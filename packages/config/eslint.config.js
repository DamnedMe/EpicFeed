// @ts-check
/**
 * Configurazione ESLint condivisa da tutti i pacchetti del monorepo.
 *
 * Oltre alle regole consigliate di TypeScript impone la TSDoc sulle API
 * pubbliche (funzioni, classi e metodi esportati), come richiesto dagli
 * standard di qualità del progetto (ADR 0004).
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Crea la configurazione ESLint per un pacchetto.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir - Cartella del pacchetto (di solito `import.meta.dirname`).
 * @param {import('eslint').Linter.Config[]} [options.extra] - Regole aggiuntive del pacchetto.
 * @returns {import('eslint').Linter.Config[]} La configurazione completa.
 */
export function createConfig({ tsconfigRootDir, extra = [] }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', 'migrations/**'] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      plugins: { jsdoc },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        // TSDoc obbligatoria su ciò che un pacchetto espone.
        'jsdoc/require-jsdoc': [
          'error',
          {
            publicOnly: true,
            require: {
              FunctionDeclaration: true,
              ClassDeclaration: true,
              MethodDefinition: true,
              ArrowFunctionExpression: true,
            },
            contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
          },
        ],
      },
    },
    {
      // I test e i file di configurazione non sono API pubblica.
      files: ['**/*.test.ts', '**/*.config.{js,ts}', 'scripts/**'],
      rules: { 'jsdoc/require-jsdoc': 'off' },
    },
    {
      files: ['**/*.js'],
      ...tseslint.configs.disableTypeChecked,
    },
    ...extra,
    prettier,
  );
}
