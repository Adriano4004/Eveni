import { defineConfig, devices } from '@playwright/test';
import { envValido } from './tests/ajuda.js';

// Nas sessões do Claude Code o Chromium já vem instalado em /opt/pw-browsers.
const chromiumLocal = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/preparar.ts',
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
    // ADMINS: a conta de administração dos testes (e2e/admin.spec.ts).
    env: { ...envValido, NODE_ENV: 'production', PORT: '3100', APP_URL: 'http://localhost:3100', ADMINS: 'admin.e2e@exemplo.ao' },
  },
});
