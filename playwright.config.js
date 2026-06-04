// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:8765',
    headless: true,
    screenshot: 'on',
    viewport: { width: 1400, height: 900 },
  },
  webServer: process.env.TEST_URL ? undefined : {
    command: 'npx serve -l 8765 -s .',
    url: 'http://localhost:8765',
    cwd: '.',
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // Firefox: run locally with `npx playwright install firefox` then add:
    // { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});
