import { defineConfig, devices } from '@playwright/test';

// Nas sessões do Claude Code o Chromium já vem instalado em /opt/pw-browsers.
const chromiumLocal = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: 'http://localhost:3100',
    ...(chromiumLocal ? { launchOptions: { executablePath: chromiumLocal } } : {}),
  },
  // Telemóvel Android de gama média: o Eveni é mobile-first.
  projects: [{ name: 'telemovel', use: { ...devices['Pixel 5'] } }],
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3100/health',
    timeout: 120_000,
    env: {
      PORT: '3100',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://eveni:eveni@localhost:5432/eveni_test',
      APP_URL: 'http://localhost:3100',
      SESSION_SECRET: 'x'.repeat(32),
    },
  },
});
