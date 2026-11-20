import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production",
  outputDir: "./test-results/production",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  use: { browserName: "chromium", trace: "retain-on-failure" },
  projects: [
    { name: "production-desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "production-mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "npm --workspace apps/student run start -- --port 5193",
      url: "http://127.0.0.1:5193",
      reuseExistingServer: false,
    },
    {
      command: "npm --workspace apps/admin run start -- --port 5194",
      url: "http://127.0.0.1:5194",
      reuseExistingServer: false,
    },
  ],
});
