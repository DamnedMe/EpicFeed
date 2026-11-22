import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Ogni file di test in un processo a sé: pdf-electron.test.ts simula
    // Electron prima di caricare pdf.js, che riconosce l'ambiente una volta sola.
    pool: 'forks',
    isolate: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // L'avvio (stdio e variabili d'ambiente) si prova a mano con Claude Desktop.
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/slides/testing.ts', 'src/**/*.d.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
