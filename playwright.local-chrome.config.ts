import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  ...base,
  projects: base.projects?.map((project) => ({
    ...project,
    use: {
      ...project.use,
      launchOptions: { executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
    },
  })),
});
