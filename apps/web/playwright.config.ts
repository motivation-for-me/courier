import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test', timeout: 30000, workers: 1,
  use: { baseURL: 'http://localhost:3100', channel: 'chrome', headless: true, viewport: { width: 1360, height: 900 } },
  webServer: { command: 'npm run dev -- --port 3100', url: 'http://localhost:3100', reuseExistingServer: true, timeout: 120000 },
});
