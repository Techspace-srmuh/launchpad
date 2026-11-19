/** Authenticated reads only. No service-role key is accepted or used. */
export interface EventsReadEnvironment {
  supabaseUrl: string;
  supabaseKey: string;
  allowedOrigins: string[];
  redisUrl?: string;
  redisToken?: string;
  cacheTtlSeconds?: number;
}

export interface EventMetadata {
  id: string;
  version: number;
  status: string;
}

export interface PublicEvent extends EventMetadata {
  title: string;
  description: string;
  poster_url: string | null;
  starts_at: string;
  ends_at: string;
  venue: string;
  registration_opens_at: string;
  registration_closes_at: string;
  capacity: number | null;
  created_at: string;
  updated_at: string;
}

const eventFields = [
  "id", "version", "status", "title", "description", "poster_url", "starts_at",
  "ends_at", "venue", "registration_opens_at", "registration_closes_at", "capacity",
  "created_at", "updated_at",
] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const studentStatuses = new Set(["published", "closed", "completed", "cancelled"]);

class ReadError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadata(value: unknown): EventMetadata[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((row) => isRecord(row) && typeof row.id === "string" &&
    uuidPattern.test(row.id) && Number.isSafeInteger(row.version) &&
    typeof row.status === "string")) return null;
  return value as EventMetadata[];
}

function publicEvents(value: unknown): PublicEvent[] | null {
  const rows = metadata(value);
  if (!rows) return null;
  const result: PublicEvent[] = [];
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    for (const field of eventFields) {
      const item = record[field];
      if (field === "version") continue;
      if (field === "capacity") {
        if (item !== null && (!Number.isSafeInteger(item) || Number(item) < 1)) return null;
      } else if (field === "poster_url") {
        if (item !== null && typeof item !== "string") return null;
      } else if (typeof item !== "string") return null;
    }
    // Never forward cached unexpected fields, even if a cache entry is malformed.
    result.push(Object.fromEntries(eventFields.map((field) => [field, record[field]])) as unknown as PublicEvent);
  }
  return result;
}

function signature(rows: EventMetadata[]): string {
  return JSON.stringify(rows.map(({ id, version, status }) => [id, version, status]));
}

async function cacheKey(project: string, rows: EventMetadata[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${project}:${signature(rows)}`));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `launchpad:events:v1:${hash}`;
}

function validRedisUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname === "/" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function createEventsReadHandler(
  env: EventsReadEnvironment,
  fetcher: typeof fetch = fetch,
  onCacheError: () => void = () => {},
): (request: Request) => Promise<Response> {
  const redisUrl = validRedisUrl(env.redisUrl);
  const cacheEnabled = Boolean(redisUrl && env.redisToken);
  const ttl = Number.isInteger(env.cacheTtlSeconds) && Number(env.cacheTtlSeconds) >= 1 &&
    Number(env.cacheTtlSeconds) <= 300 ? Number(env.cacheTtlSeconds) : 30;

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Expose-Headers": "x-launchpad-cache",
    });
    if (origin && env.allowedOrigins.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
    const reply = (status: number, body: unknown, cache?: string) => {
      if (cache) headers.set("x-launchpad-cache", cache);
      return new Response(JSON.stringify(body), { status, headers });
    };
    if (origin && !env.allowedOrigins.includes(origin)) return reply(403, { error: "Origin is not allowed." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { error: "Use POST." });
    const authorization = request.headers.get("authorization");
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return reply(401, { error: "Sign in to view events." });
    if (!env.supabaseUrl || !env.supabaseKey) return reply(503, { error: "Event service is not configured." });

    const backendHeaders = {
      "apikey": env.supabaseKey,
      "Authorization": authorization,
      "Content-Type": "application/json",
    };
    const database = async (path: string, method = "GET", body?: string): Promise<unknown> => {
      let response: Response;
      try {
        response = await fetcher(`${env.supabaseUrl.replace(/\/$/, "")}${path}`, {
          method, body, headers: backendHeaders, signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new ReadError(503, "Event service is temporarily unavailable.");
      }
      if (!response.ok) throw new ReadError(response.status === 401 ? 401 : 503,
        response.status === 401 ? "Your session has expired. Sign in again." : "Unable to read events. Please retry.");
      try {
        return await response.json();
      } catch {
        throw new ReadError(503, "Event service returned an invalid response.");
      }
    };
    const redis = async (command: (string | number)[]): Promise<unknown> => {
      const response = await fetcher(redisUrl!, {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.redisToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(300),
      });
      if (!response.ok) throw new Error("Redis unavailable");
      const body: unknown = await response.json();
      if (!isRecord(body) || body.error || !("result" in body)) throw new Error("Invalid Redis result");
      return body.result;
    };

    try {
      // Verify with Auth; never trust a decoded JWT or a role supplied by the client.
      const user = await database("/auth/v1/user");
      if (!isRecord(user) || typeof user.id !== "string") throw new ReadError(401, "Sign in to view events.");
      const bodyText = await request.text();
      if (bodyText.length > 1024) return reply(400, { error: "Request is too large." });
      let input: unknown;
      try { input = bodyText ? JSON.parse(bodyText) : {}; } catch { return reply(400, { error: "Invalid request." }); }
      if (!isRecord(input)) return reply(400, { error: "Invalid request." });
      if (input.event_id !== undefined && (typeof input.event_id !== "string" || !uuidPattern.test(input.event_id))) {
        return reply(400, { error: "Invalid event ID." });
      }
      const limit = input.limit === undefined ? 100 : input.limit;
      const offset = input.offset === undefined ? 0 : input.offset;
      if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100 ||
        !Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 100000) {
        return reply(400, { error: "Invalid page. Use limit 1–100 and a non-negative offset." });
      }
      const params = new URLSearchParams({
        order: "starts_at.asc,id.asc", limit: String(input.event_id ? 1 : limit), offset: String(input.event_id ? 0 : offset),
      });
      if (typeof input.event_id === "string") params.set("id", `eq.${input.event_id}`);
      const read = async (select: string) => {
        const query = new URLSearchParams(params);
        query.set("select", select);
        return database(`/rest/v1/events?${query}`);
      };
      const readEvents = async (): Promise<PublicEvent[]> => {
        const events = publicEvents(await read(eventFields.join(",")));
        if (!events) throw new ReadError(503, "Event service returned invalid event data.");
        return events;
      };
      const admin = await database("/rest/v1/rpc/is_admin", "POST", "{}");
      if (typeof admin !== "boolean") throw new ReadError(503, "Unable to check event permissions.");
      if (admin || !cacheEnabled) return reply(200, { events: await readEvents() }, admin ? "admin-bypass" : "disabled");

      // Fresh RLS-scoped versions on EVERY request prevent stale visibility or
      // edits being served after publication changes. Cache keys are project-scoped.
      const versions = metadata(await read("id,version,status"));
      if (!versions || versions.some((row) => !studentStatuses.has(row.status))) {
        throw new ReadError(503, "Unable to check current event visibility.");
      }
      if (versions.length === 0) return reply(200, { events: [] }, "empty");
      const key = await cacheKey(env.supabaseUrl, versions);
      let cacheState = "miss";
      try {
        const cached = await redis(["GET", key]);
        if (typeof cached === "string") {
          const events = publicEvents(JSON.parse(cached));
          if (events && signature(events) === signature(versions)) return reply(200, { events }, "hit");
        }
      } catch {
        onCacheError();
        cacheState = "unavailable";
      }
      const events = await readEvents();
      // Do not populate an old version key if a concurrent admin edit changed data.
      if (signature(events) === signature(versions) && events.every((row) => studentStatuses.has(row.status))) {
        try { await redis(["SET", key, JSON.stringify(events), "EX", ttl]); } catch { onCacheError(); cacheState = "unavailable"; }
      }
      return reply(200, { events }, cacheState);
    } catch (error) {
      if (error instanceof ReadError) return reply(error.status, { error: error.message });
      return reply(503, { error: "Event service is temporarily unavailable." });
    }
  };
}
