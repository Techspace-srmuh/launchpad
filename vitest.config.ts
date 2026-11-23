import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "supabase/main/supabase/functions/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
  },
});
