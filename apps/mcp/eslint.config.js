// @ts-check
import { createConfig } from '@epicfeed/config/eslint';

/**
 * Il server MCP gira sul PC dello studente e parla con EpicFeed solo
 * attraverso l'API pubblica: niente accesso diretto a database o adapter.
 */
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  extra: [
    // Il pacchetto generato (bundle/) non è codice sorgente.
    { ignores: ['bundle/**', 'smoke-kit/**'] },
    {
      files: ['src/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@epicfeed/*/infrastructure', '@epicfeed/db', 'drizzle-orm', '@supabase/*'],
                message: "Il server MCP usa solo l'API di EpicFeed, mai il database.",
              },
            ],
          },
        ],
      },
    },
  ],
});
