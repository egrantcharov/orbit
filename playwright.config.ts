import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke-test config. Tests run against a local dev server so they exercise
 * the actual proxy/middleware → Clerk gate path. They deliberately do NOT
 * exercise authenticated flows end-to-end — those need Clerk testing tokens
 * which aren't in CI yet. Instead the suite verifies:
 *
 *   1. Landing page renders the shipped v3 surface.
 *   2. Protected app routes 307-redirect unauthenticated users.
 *   3. Protected API routes return 401 JSON (not HTML).
 *   4. CSV import endpoint rejects malformed payloads with 400 / 401.
 *
 * Real auth coverage is a Week-9 follow-up.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 90_000,
      },
});
