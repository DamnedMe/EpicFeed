import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Regole, casi d'uso e richieste ai fornitori sono puri: devono restare coperti.
      include: ['src/domain/**/*.ts', 'src/application/**/*.ts', 'src/contracts/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
