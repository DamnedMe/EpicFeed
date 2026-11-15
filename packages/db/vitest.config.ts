import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Avviare PGlite (Postgres in WebAssembly) richiede qualche secondo.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
