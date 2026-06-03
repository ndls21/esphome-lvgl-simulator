// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:8765',
    headless: true,
    screenshot: 'on',
    viewport: { width: 1400, height: 900 },
  },
  webServer: process.env.TEST_URL ? undefined : {
    command: 'python3 -m http.server 8765',
    url: 'http://localhost:8765',
    cwd: '.',
    reuseExistingServer: true,
    timeout: 5000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // Firefox: run locally with `npx playwright install firefox` then add:
    // { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});
