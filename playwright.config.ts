import { defineConfig } from "@playwright/test";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/e2e",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: ci ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5183",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-mobile-viewport",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: "npm --workspace apps/student run dev -- --port 5183",
      env: { NEXT_PUBLIC_MAIN_SUPABASE_URL: "", NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY: "" },
      url: "http://127.0.0.1:5183",
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      command: "npm --workspace apps/admin run dev -- --port 5184",
      env: { NEXT_PUBLIC_MAIN_SUPABASE_URL: "", NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY: "" },
      url: "http://127.0.0.1:5184",
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
