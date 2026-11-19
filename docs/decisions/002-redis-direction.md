# 002 - Redis architecture direction

**Date:** 20 November 2026.

**Status:** the user requested Redis to help handle concurrent users within an infrastructure budget that excludes horizontal scaling, then authorized implementation. The optional authenticated event-read cache is implemented and deployed to MAIN. Redis provider/provisioning, production quotas and traffic targets remain open; no live Redis instance is connected. This does not approve the whole draft specification. See the [implementation runbook](../runbooks/redis-events.md).

## Implemented first workflow

- **Role and task:** students browse published event lists and details during traffic bursts.
- **Workflow:** a protected backend read path can serve eligible non-draft event data from a short-lived Redis cache, retrieving it from Project 1 on a miss. Fresh RLS-filtered version metadata changes the cache key after admin edits; old entries expire. Admin reads bypass the shared cache. The backend remains responsible for visibility; Redis credentials never enter either frontend.
- **Data implication:** Redis holds disposable derived event data. PostgreSQL remains authoritative. Do not cache student-private records, QR credentials or certificate download results in a shared public cache. Set expiration and include any required audience distinctions in cache keys.
- **Acceptance criteria:** unpublished/cancelled events obey database visibility rules after admin changes; cache hits avoid full event-payload reads; expiration and Redis failure fall back to authorized database reads; cached capacity never authorizes a registration; concurrent final-seat requests still produce no overbooking or duplicates. Handler behavior is tested with simulated Redis; real provider connectivity/hits/outages remain unverified. Fresh metadata is still queried on every cache-enabled read. Define expected traffic and latency targets before a load test can establish capacity.

## Boundaries and next decisions

Redis can reduce repeated work; it does not add database write capacity or replace PostgreSQL transactions, unique constraints, RLS or capacity locking. Rate limiting is another possible server-side use, with thresholds and outage behavior to be decided before enforcement. Redis is not yet selected as the email queue or scheduler.

The database correctness foundation and cache handler have been built and tested. The handler currently defaults to 30-second cache TTL, a 300 ms Redis timeout and authorized database fallback. Choose and verify the Redis provider, region, credentials and quotas before enabling live caching; reassess these defaults with real traffic. Do not assume a free quota or claim a supported concurrent-user count without measurement.
