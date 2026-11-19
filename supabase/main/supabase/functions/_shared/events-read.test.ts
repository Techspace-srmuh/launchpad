import { describe, expect, it } from "vitest";

import { createEventsReadHandler, type EventsReadEnvironment, type PublicEvent } from "./events-read";

const eventId = "10000000-0000-4000-8000-000000000001";
const example: PublicEvent = {
  id: eventId, version: 1, status: "published", title: "Build night", description: "Build together",
  poster_url: null, starts_at: "2027-01-01T10:00:00Z", ends_at: "2027-01-01T12:00:00Z",
  venue: "Lab 1", registration_opens_at: "2026-12-01T00:00:00Z", registration_closes_at: "2027-01-01T09:00:00Z",
  capacity: 20, created_at: "2026-11-20T00:00:00Z", updated_at: "2026-11-20T00:00:00Z",
};
const settings: EventsReadEnvironment = {
  supabaseUrl: "https://main.example", supabaseKey: "public-key",
  allowedOrigins: ["https://student.example"],
  redisUrl: "https://redis.example", redisToken: "server-only-token", cacheTtlSeconds: 30,
};

function fixture(overrides: Partial<EventsReadEnvironment> = {}) {
  const state = {
    events: [{ ...example }], admin: false, authorized: true, redisFailure: false,
    databaseFailure: false, metadataFailure: false, clock: 0, fullReads: 0, metadataReads: 0, authReads: 0,
    roleReads: 0, redisCommands: [] as unknown[][],
    cached: new Map<string, { value: string; expires: number }>(),
    lastDatabaseAuth: "", lastDatabaseKey: "", redisAuth: "",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === "https://redis.example") {
      state.redisAuth = new Headers(init?.headers).get("authorization") ?? "";
      const command: unknown[] = JSON.parse(String(init?.body));
      state.redisCommands.push(command);
      if (state.redisFailure) throw new DOMException("Timeout", "TimeoutError");
      const key = String(command[1]);
      if (command[0] === "GET") {
        const entry = state.cached.get(key);
        return json({ result: entry && entry.expires > state.clock ? entry.value : null });
      }
      state.cached.set(key, { value: String(command[2]), expires: state.clock + Number(command[4]) * 1000 });
      return json({ result: "OK" });
    }
    state.lastDatabaseAuth = new Headers(init?.headers).get("authorization") ?? "";
    state.lastDatabaseKey = new Headers(init?.headers).get("apikey") ?? "";
    if (url.pathname === "/auth/v1/user") {
      state.authReads++;
      return state.authorized ? json({ id: "20000000-0000-4000-8000-000000000001" }) : json({ error: "expired" }, 401);
    }
    if (state.databaseFailure) return json({ error: "database unavailable" }, 503);
    if (url.pathname.endsWith("/rpc/is_admin")) { state.roleReads++; return json(state.admin); }
    let visible = state.events.filter((row) => state.admin || row.status !== "draft");
    if (url.searchParams.has("id")) visible = visible.filter((row) => `eq.${row.id}` === url.searchParams.get("id"));
    if (url.searchParams.get("select") === "id,version,status") {
      state.metadataReads++;
      if (state.metadataFailure) return json({ error: "RLS visibility probe failed" }, 503);
      return json(visible.map(({ id, version, status }) => ({ id, version, status })));
    }
    state.fullReads++;
    return json(visible);
  };
  const handler = createEventsReadHandler({ ...settings, ...overrides }, fetcher);
  const request = (body: unknown = {}, authorization: string | null = "Bearer student-session") => {
    const headers: Record<string, string> = { "Content-Type": "application/json", "Origin": "https://student.example" };
    if (authorization) headers.Authorization = authorization;
    return handler(new Request("https://main.example/functions/v1/events-read", {
      method: "POST", headers, body: JSON.stringify(body),
    }));
  };
  return { state, handler, request };
}

describe("authenticated event cache", () => {
  it("rejects missing and expired sessions before touching the cache", async () => {
    const { request, state } = fixture();
    expect((await request({}, null)).status).toBe(401);
    state.authorized = false;
    expect((await request()).status).toBe(401);
    expect(state.redisCommands).toEqual([]);
    expect(state.fullReads).toBe(0);
  });

  it("uses the caller JWT and public project key for all authorized database reads", async () => {
    const { request, state } = fixture();
    await request();
    expect(state.lastDatabaseAuth).toBe("Bearer student-session");
    expect(state.lastDatabaseKey).toBe("public-key");
    expect(state.redisAuth).toBe("Bearer server-only-token");
  });

  it("populates on a miss and avoids a full event payload read on a hit", async () => {
    const { request, state } = fixture();
    const first = await request();
    expect(first.status).toBe(200);
    expect(first.headers.get("x-launchpad-cache")).toBe("miss");
    expect(await first.json()).toEqual({ events: [example] });
    const second = await request();
    expect(second.headers.get("x-launchpad-cache")).toBe("hit");
    expect(await second.json()).toEqual({ events: [example] });
    expect(state.fullReads).toBe(1);
    expect(state.metadataReads).toBe(2);
    expect(state.authReads).toBe(2);
    expect(state.roleReads).toBe(2);
    expect(state.redisCommands[1]).toEqual(["SET", expect.any(String), JSON.stringify([example]), "EX", 30]);
  });

  it("expires disposable cache records", async () => {
    const { request, state } = fixture();
    await request();
    state.clock += 31_000;
    expect((await request()).headers.get("x-launchpad-cache")).toBe("miss");
    expect(state.fullReads).toBe(2);
  });

  it("does not return old event details after a database version changes", async () => {
    const { request, state } = fixture();
    await request();
    state.events[0] = { ...example, title: "Changed title", version: 2 };
    const response = await request();
    expect(response.headers.get("x-launchpad-cache")).toBe("miss");
    expect((await response.json()).events[0].title).toBe("Changed title");
  });

  it("does not disclose a cached event when RLS removes it from visibility", async () => {
    const { request, state } = fixture();
    await request();
    state.events[0] = { ...example, status: "draft", version: 2 };
    const response = await request();
    expect(await response.json()).toEqual({ events: [] });
    expect(state.redisCommands).toHaveLength(2);
  });

  it("returns cancellation immediately rather than stale published status", async () => {
    const { request, state } = fixture();
    await request();
    state.events[0] = { ...example, status: "cancelled", version: 2 };
    const response = await request();
    expect((await response.json()).events[0].status).toBe("cancelled");
  });

  it("changes the cache key when a newly published event becomes visible", async () => {
    const { request, state } = fixture();
    state.events.push({ ...example, id: "10000000-0000-4000-8000-000000000002", status: "draft" });
    await request();
    const firstKey = state.redisCommands[0][1];
    state.events[1] = { ...state.events[1], status: "published", version: 2 };
    const response = await request();
    expect(response.headers.get("x-launchpad-cache")).toBe("miss");
    expect((await response.json()).events).toHaveLength(2);
    expect(state.redisCommands[2][1]).not.toBe(firstKey);
  });

  it("bypasses shared cache for admins and freshly rechecks authority on every request", async () => {
    const { request, state } = fixture();
    await request(); // A student-visible cache entry already exists.
    state.admin = true;
    state.events.push({ ...example, id: "10000000-0000-4000-8000-000000000002", status: "draft" });
    const admin = await request();
    expect(admin.headers.get("x-launchpad-cache")).toBe("admin-bypass");
    expect((await admin.json()).events).toHaveLength(2);
    expect(state.redisCommands).toHaveLength(2);
    state.admin = false;
    const student = await request();
    expect((await student.json()).events).toHaveLength(1);
    expect(student.headers.get("x-launchpad-cache")).toBe("hit");
    expect(state.roleReads).toBe(3);
  });

  it("falls back to authorized database reads on Redis timeout or missing credentials", async () => {
    const { request, state } = fixture();
    state.redisFailure = true;
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-launchpad-cache")).toBe("unavailable");
    expect(await response.json()).toEqual({ events: [example] });
    const disabled = fixture({ redisToken: undefined });
    expect((await disabled.request()).headers.get("x-launchpad-cache")).toBe("disabled");
    expect(disabled.state.redisCommands).toEqual([]);
  });

  it("fails closed when permission or visibility checks fail, even with a warm cache", async () => {
    const { request, state } = fixture();
    await request();
    state.databaseFailure = true;
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unable to read events. Please retry." });
    expect(state.redisCommands).toHaveLength(2);
  });

  it("refuses a warm cache if the fresh metadata authorization check fails", async () => {
    const { request, state } = fixture();
    await request();
    state.metadataFailure = true;
    const response = await request();
    expect(response.status).toBe(503);
    expect(state.redisCommands).toHaveLength(2);
    expect(state.fullReads).toBe(1);
  });

  it("refuses a warm cache after session revocation", async () => {
    const { request, state } = fixture();
    await request();
    state.authorized = false;
    expect((await request()).status).toBe(401);
    expect(state.redisCommands).toHaveLength(2);
  });

  it("treats invalid cache data as a miss and strips unexpected cached properties", async () => {
    const { request, state } = fixture();
    await request();
    const entry = Array.from(state.cached.values())[0];
    entry.value = "invalid JSON";
    expect((await request()).status).toBe(200);
    expect(state.fullReads).toBe(2);
    entry.value = JSON.stringify([{ ...example, user_email: "must-not-leak@example.com" }]);
    // SET replaced the original map entry, so alter the current entry.
    Array.from(state.cached.values())[0].value = entry.value;
    const response = await request();
    expect(response.headers.get("x-launchpad-cache")).toBe("hit");
    expect((await response.text()).includes("user_email")).toBe(false);
  });

  it("rejects mismatched cached identities or versions", async () => {
    const { request, state } = fixture();
    await request();
    Array.from(state.cached.values())[0].value = JSON.stringify([{ ...example, version: 999 }]);
    const response = await request();
    expect(response.headers.get("x-launchpad-cache")).toBe("miss");
    expect((await response.json()).events[0].version).toBe(1);
  });

  it("serves detail queries and rejects invalid IDs and pagination", async () => {
    const { request } = fixture();
    expect((await request({ event_id: eventId })).status).toBe(200);
    const missing = await request({ event_id: "10000000-0000-4000-8000-000000000099" });
    expect(await missing.json()).toEqual({ events: [] });
    expect((await request({ event_id: "x&select=*" })).status).toBe(400);
    expect((await request({ limit: 101 })).status).toBe(400);
    expect((await request({ offset: -1 })).status).toBe(400);
  });

  it("allows configured browser origins only, with no shared browser/CDN caching", async () => {
    const { handler, request } = fixture();
    const response = await request();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://student.example");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Origin");
    expect((await handler(new Request("https://main.example", {
      method: "OPTIONS", headers: { Origin: "https://student.example" },
    }))).status).toBe(204);
    expect((await handler(new Request("https://main.example", {
      method: "OPTIONS", headers: { Origin: "https://evil.example" },
    }))).status).toBe(403);
  });
});
