// @ts-check
import { createConfig } from '@study-feed/config/eslint';

/**
 * Il server MCP gira sul PC dello studente e parla con EpicFeed solo
 * attraverso l'API pubblica: niente accesso diretto a database o adapter.
 */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [
    // Il pacchetto generato (bundle/) non è codice sorgente.
    { ignores: ['bundle/**'] },
    {
      files: ['src/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@study-feed/adapters', '@study-feed/db', 'drizzle-orm', '@supabase/*'],
                message: "Il server MCP usa solo l'API di EpicFeed, mai il database.",
              },
            ],
          },
        ],
      },
    },
  ],
});
