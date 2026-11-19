import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { BrowserConfig } from "./config";

export function createBrowserClient(config: BrowserConfig): SupabaseClient {
  return createClient(config.url, config.publishableKey);
}
