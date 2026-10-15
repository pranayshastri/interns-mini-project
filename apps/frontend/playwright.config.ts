import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 45000,
  expect: { timeout: 12000 }, reporter: 'list',
  outputDir: '../../test-artifacts/frontend/results',
  use: { baseURL: 'http://127.0.0.1:3114', launchOptions: { executablePath: process.env.CHROME_PATH || undefined }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1 --port 3114', url: 'http://127.0.0.1:3114', reuseExistingServer: false, env: { ROBONEST_AUTH_ENABLED: 'false', ROBONEST_VERIFIED_CAPABILITIES: '', NEXT_DIST_DIR: '.next-real-only-test' } },
});
