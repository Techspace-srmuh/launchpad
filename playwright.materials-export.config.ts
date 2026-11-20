import { defineConfig } from "@playwright/test";

// Existing servers only: never starts or stops a Next.js development instance.
export default defineConfig({
  testDir: "./tests/materials-export", workers: 1, retries: 0, timeout: 180_000,
  reporter: "list", outputDir: "test-results/materials-export",
  use: { browserName: "chromium", actionTimeout: 15_000, navigationTimeout: 30_000,
    trace: "off", screenshot: "off", video: "off" },
});
