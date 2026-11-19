/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAIN_EVENTS_CACHE_ENABLED?: string;
  readonly VITE_MAIN_SUPABASE_URL: string;
  readonly VITE_MAIN_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
