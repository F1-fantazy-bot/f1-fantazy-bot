import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  workers: 4,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:5179',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: ['en', 'he'].flatMap((lang) =>
    ['light', 'dark'].flatMap((theme) =>
      ['desktop', 'mobile'].map((size) => ({
        name: `${lang}-${theme}-${size}`,
        use: {
          viewport:
            size === 'mobile'
              ? { width: 390, height: 844 }
              : { width: 1440, height: 1000 },
          colorScheme: theme as 'light' | 'dark',
        },
      })),
    ),
  ),
  webServer: [
    {
      command: 'node e2e/mock-runtime.mjs',
      url: 'http://127.0.0.1:7079/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5179 --strictPort',
      url: 'http://127.0.0.1:5179',
      reuseExistingServer: false,
      env: {
        VITE_AGENT_API_URL: 'http://127.0.0.1:7079/api/agent/copilotkit',
        VITE_GOOGLE_CLIENT_ID: 'synthetic-browser-test',
      },
    },
  ],
});
