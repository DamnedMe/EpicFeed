import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Stesso alias `@/` di tsconfig.json, così i test importano come il codice dell'app.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
