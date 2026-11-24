// @ts-check
import { createConfig } from '@epicfeed/config/eslint';

/**
 * Gli adapter implementano le porte del core: possono usare database e
 * librerie di I/O, ma non le app (Next.js, estensione, MCP).
 */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [
    { files: ['test/**'], rules: { 'jsdoc/require-jsdoc': 'off' } },
    {
      files: ['src/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['next', 'next/*', 'react', 'react-*'],
                message: 'Gli adapter non dipendono dalle app.',
              },
            ],
          },
        ],
      },
    },
  ],
});
