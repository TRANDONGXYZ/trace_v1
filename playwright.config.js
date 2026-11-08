import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run dev:ollama -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: true },
});
