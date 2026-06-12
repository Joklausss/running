import { defineConfig, devices } from '@playwright/test';

// E2E runs against the real dev stack (frontend + backend + local Postgres).
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5180',
    permissions: ['geolocation'],
    geolocation: { latitude: 45.75, longitude: 4.85 },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:5180',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
