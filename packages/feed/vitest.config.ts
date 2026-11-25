import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // I test dell'infrastruttura avviano PGlite (Postgres in WebAssembly).
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      // Regole e casi d'uso sono puri: devono restare (quasi) interamente coperti.
      include: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
