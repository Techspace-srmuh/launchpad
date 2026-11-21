import { defineConfig } from "@playwright/test";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/e2e",
  fullyParallel: false,
  workers: ci ? 2 : 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: ci ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
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
      command: "npm --workspace apps/student run dev",
      env: { NEXT_PUBLIC_MAIN_SUPABASE_URL: "", NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY: "" },
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      command: "npm --workspace apps/admin run dev",
      env: { NEXT_PUBLIC_MAIN_SUPABASE_URL: "", NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY: "" },
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
