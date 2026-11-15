// @ts-check
import { createConfig } from '@study-feed/config/eslint';

/**
 * I contratti descrivono solo la forma dei dati ai confini: possono usare zod,
 * ma non adapter, database o framework.
 */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [
    {
      files: ['src/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@study-feed/adapters',
                  '@study-feed/db',
                  'drizzle-orm',
                  '@supabase/*',
                  'react',
                  'next',
                ],
                message: 'I contratti dipendono solo da zod (e dai tipi del core).',
              },
            ],
          },
        ],
      },
    },
  ],
});
