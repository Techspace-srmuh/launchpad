import { createEventsReadHandler } from "../_shared/events-read.ts";

// Narrow declaration keeps the adapter checkable by both TypeScript and Deno.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(createEventsReadHandler({
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  supabaseKey: Deno.env.get("MAIN_SUPABASE_PUBLISHABLE_KEY")?.trim() || Deno.env.get("SUPABASE_ANON_KEY") || "",
  allowedOrigins: (Deno.env.get("EVENTS_ALLOWED_ORIGINS") ?? "http://127.0.0.1:5173,http://127.0.0.1:5174")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
  redisUrl: Deno.env.get("REDIS_REST_URL"),
  redisToken: Deno.env.get("REDIS_REST_TOKEN"),
  cacheTtlSeconds: Number(Deno.env.get("REDIS_EVENTS_TTL_SECONDS") ?? 30),
}, fetch, () => console.warn("events-read: Redis unavailable; using authorized database reads.")));
