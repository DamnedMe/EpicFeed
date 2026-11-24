// @ts-check
import { createConfig } from '@epicfeed/config/eslint';

/**
 * Regola delle dipendenze della clean architecture (ADR 0004): il core non
 * conosce adapter, database, app né framework. Le dipendenze vanno solo verso
 * l'interno: application → domain, mai il contrario.
 */
const forbiddenOutside = [
  {
    group: ['@epicfeed/*', '!@epicfeed/config', '!@epicfeed/shared'],
    message: 'Il core dipende solo da @epicfeed/shared (clean architecture, ADR 0019).',
  },
  {
    group: [
      'react',
      'react-*',
      'next',
      'next/*',
      'drizzle-orm',
      'drizzle-orm/*',
      '@supabase/*',
      'zod',
    ],
    message: 'Il core è TypeScript puro: niente framework, ORM o librerie di I/O.',
  },
  { group: ['node:*'], message: 'Il core deve girare uguale nel browser e su Node.' },
];

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [
    {
      files: ['src/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': ['error', { patterns: forbiddenOutside }],
      },
    },
    {
      files: ['src/domain/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              ...forbiddenOutside,
              {
                group: ['../application', '../application/*'],
                message: "Il dominio non dipende dai casi d'uso.",
              },
            ],
          },
        ],
      },
    },
  ],
});
