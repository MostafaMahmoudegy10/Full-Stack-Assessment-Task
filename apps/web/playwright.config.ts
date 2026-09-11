import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3743',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev -p 3743',
    url: 'http://localhost:3743/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4734', NEXT_DIST_DIR: '.next-browser' },
  },
});
