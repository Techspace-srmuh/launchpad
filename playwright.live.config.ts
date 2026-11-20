import { defineConfig } from "@playwright/test";

// Run through npm run test:live: fixtures and public configuration are supplied
// by the harness, which also removes every temporary account/event afterward.
export default defineConfig({
  testDir: "./tests/live",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: "list",
  use: { browserName: "chromium", actionTimeout: 15_000, navigationTimeout: 20_000, trace: "off", screenshot: "off", video: "off" },
  webServer: [
    {
      command: "npm --workspace apps/student run dev -- --port 5183",
      env: { NEXT_PUBLIC_MAIN_EVENTS_CACHE_ENABLED: "false" },
      url: "http://127.0.0.1:5183",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm --workspace apps/admin run dev -- --port 5184",
      env: { NEXT_PUBLIC_MAIN_EVENTS_CACHE_ENABLED: "false" },
      url: "http://127.0.0.1:5184",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
