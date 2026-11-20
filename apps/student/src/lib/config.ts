import { readBrowserConfig } from "@launchpad/supabase";

// Next.js inlines explicitly named public values into the browser bundle.
export const browserConfig = readBrowserConfig({
  NEXT_PUBLIC_MAIN_SUPABASE_URL: process.env.NEXT_PUBLIC_MAIN_SUPABASE_URL,
  NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY,
});
