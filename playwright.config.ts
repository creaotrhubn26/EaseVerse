import { defineConfig } from '@playwright/test';

const port = Number.parseInt(process.env.E2E_PORT || '5051', 10);

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    permissions: ['microphone'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // Disable API key enforcement for local E2E runs; keep DB settings from .env if present.
    command: `EXTERNAL_API_KEY= PRONOUNCE_API_KEY= SESSION_SCORING_API_KEY= PORT=${port} npm run server:prod`,
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
