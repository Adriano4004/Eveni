import { defineConfig, devices } from '@playwright/test';
import { envValido } from './tests/ajuda.js';

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
    env: { ...envValido, NODE_ENV: 'production', PORT: '3100', APP_URL: 'http://localhost:3100' },
  },
});
