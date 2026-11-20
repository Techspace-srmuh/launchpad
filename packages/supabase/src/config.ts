export interface BrowserConfig {
  url: string;
  publishableKey: string;
}

export type BrowserConfigResult =
  | { ok: true; config: BrowserConfig }
  | { ok: false; error: string };

const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]+$/;

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username || url.password || url.search || url.hash) return false;
  if (url.pathname !== "/") return false;

  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return localHost ? url.protocol === "http:" || url.protocol === "https:" : url.protocol === "https:";
}

export function readBrowserConfig(env: Record<string, unknown>): BrowserConfigResult {
  const rawUrl = env.NEXT_PUBLIC_MAIN_SUPABASE_URL;
  const rawKey = env.NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY;

  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return { ok: false, error: "NEXT_PUBLIC_MAIN_SUPABASE_URL is required." };
  }
  if (typeof rawKey !== "string" || rawKey.trim() === "") {
    return { ok: false, error: "NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY is required." };
  }
  if (!validEndpoint(rawUrl)) {
    return {
      ok: false,
      error: "NEXT_PUBLIC_MAIN_SUPABASE_URL must be an HTTPS origin (HTTP is allowed for localhost).",
    };
  }
  if (rawKey.startsWith("sb_secret_")) {
    return { ok: false, error: "A Supabase publishable key is required; secret keys are not allowed in the browser." };
  }
  if (!PUBLISHABLE_KEY_PATTERN.test(rawKey)) {
    return { ok: false, error: "NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key." };
  }

  return {
    ok: true,
    config: { url: new URL(rawUrl).origin, publishableKey: rawKey },
  };
}

