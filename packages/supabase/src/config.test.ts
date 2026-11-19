import { describe, expect, it } from "vitest";

import { readBrowserConfig } from "./config";

const publicKey = "sb_publishable_example_public_key";

describe("readBrowserConfig", () => {
  it("reports missing URL and key without echoing environment values", () => {
    expect(readBrowserConfig({})).toEqual({
      ok: false,
      error: "VITE_MAIN_SUPABASE_URL is required.",
    });
    expect(readBrowserConfig({ VITE_MAIN_SUPABASE_URL: "https://example.supabase.co" })).toEqual({
      ok: false,
      error: "VITE_MAIN_SUPABASE_PUBLISHABLE_KEY is required.",
    });
  });

  it.each([
    "not a URL",
    "http://project.supabase.co",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/path",
    "https://project.supabase.co?query=value",
    "https://project.supabase.co#fragment",
  ])("rejects malformed or unsafe URL %s", (url) => {
    const result = readBrowserConfig({
      VITE_MAIN_SUPABASE_URL: url,
      VITE_MAIN_SUPABASE_PUBLISHABLE_KEY: publicKey,
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it.each(["sb_secret_private_value", "eyJhbGciOiJIUzI1NiJ9.service_role.secret", "anon-key", "sb_publishable_", "sb_publishable_   "])(
    "rejects non-public keys without returning the key: %s",
    (key) => {
      const result = readBrowserConfig({
        VITE_MAIN_SUPABASE_URL: "https://project.supabase.co",
        VITE_MAIN_SUPABASE_PUBLISHABLE_KEY: key,
      });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(key);
    },
  );

  it.each(["http://localhost:54321", "http://127.0.0.1:54321"])(
    "accepts local development endpoint %s",
    (url) => {
      expect(
        readBrowserConfig({
          VITE_MAIN_SUPABASE_URL: url,
          VITE_MAIN_SUPABASE_PUBLISHABLE_KEY: publicKey,
        }),
      ).toEqual({ ok: true, config: { url, publishableKey: publicKey } });
    },
  );

  it("accepts an HTTPS public endpoint and normalizes it to an origin", () => {
    expect(
      readBrowserConfig({
        VITE_MAIN_SUPABASE_URL: "https://project.supabase.co/",
        VITE_MAIN_SUPABASE_PUBLISHABLE_KEY: publicKey,
      }),
    ).toEqual({
      ok: true,
      config: { url: "https://project.supabase.co", publishableKey: publicKey },
    });
  });
});
