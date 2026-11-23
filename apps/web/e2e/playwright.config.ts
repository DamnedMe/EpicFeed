import { defineConfig, devices } from '@playwright/test';

/**
 * Test del feed sui telefoni (M3, ADR 0015). Girano sul banco di prova di
 * `e2e/harness` (servito con `page.route`, senza server) con le dimensioni
 * e il tocco di un iPhone e di un Android, in Chromium.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'off' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
});
