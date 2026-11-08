import { defineConfig } from '@playwright/test';
const publicURL = process.env.TRACE_TEST_PUBLIC_URL;
export default defineConfig({
  testDir: './tests/cloud-browser', workers: 1, timeout: 90000,
  use: { baseURL: publicURL || 'http://127.0.0.1:4173', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 } },
  ...(publicURL ? {} : { webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true } }),
});
