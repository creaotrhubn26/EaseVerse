import { defineConfig } from '@playwright/test';

const port = Number.parseInt(process.env.E2E_PORT || '5051', 10);
const apiBaseUrl = `http://127.0.0.1:${port}`;
const e2eApiKey = 'easeverse-e2e-local-only';
process.env.EXPO_PUBLIC_API_URL ||= apiBaseUrl;
process.env.EXPO_PUBLIC_API_KEY ||= e2eApiKey;
process.env.E2E_API_BASE ||= apiBaseUrl;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    permissions: ['microphone'],
    screenshot: 'only-on-failure',
    trace: 'on',
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // Exercise the same API-key boundary as production with a local-only test value.
    command: `EXTERNAL_API_KEY=${e2eApiKey} PRONOUNCE_API_KEY= SESSION_SCORING_API_KEY= EXPO_PUBLIC_API_URL=${apiBaseUrl} EXPO_PUBLIC_API_KEY=${e2eApiKey} PORT=${port} npm run server:prod`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          // Avoid permission prompts and provide a fake mic source in headless mode.
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
    },
  ],
});
