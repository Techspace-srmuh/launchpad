"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@launchpad/ui";
import { isProfileComplete, readEvents, useIdentity, workflowError, type EventRecord, type RegistrationRecord } from "@launchpad/supabase";

const cacheEnabled = process.env.NEXT_PUBLIC_MAIN_EVENTS_CACHE_ENABLED === "true";
const date = (value: string) => new Date(value).toLocaleString();

export function StudentEvents({ mine = false }: { mine?: boolean }) {
  const { client, session } = useIdentity();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setLoading(true); setError("");
    void (async () => {
      let rows: EventRecord[];
      if (mine) {
        const registrations = await client.from("registrations").select("event_id").eq("user_id", session.user.id).order("created_at", { ascending: false }).order("id").range(page * 100, page * 100 + 99);
        if (registrations.error) throw registrations.error;
        const ids = (registrations.data ?? []).map((row: { event_id: string }) => row.event_id);
        if (!ids.length) rows = [];
        else {
          const result = await client.from("events").select("*").in("id", ids).order("starts_at");
          if (result.error) throw result.error;
          rows = result.data as EventRecord[];
        }
      } else rows = await readEvents(client, cacheEnabled, undefined, page * 100);
      if (active) setEvents(rows);
    })().catch((failure: unknown) => { if (active) setError(workflowError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, mine, version, page]);
  return <section className="workflow-section"><div className="workflow-heading"><h1>{mine ? "My events" : "Explore events"}</h1><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh events</Button></div>
    {loading ? <p role="status">Loading events…</p> : error ? <p role="alert">{error}</p> : !events.length ? <p>{mine ? "You have not registered for any events yet." : "No published events are available yet."}</p> : <div className="event-grid">{events.map((event) => <article className="workflow-panel" key={event.id}><span className="event-status">{event.status}</span><h2><Link href={`/events/${event.id}`}>{event.title}</Link></h2><p>{date(event.starts_at)}</p><p>{event.venue}</p><Link href={`/events/${event.id}`}>View event</Link></article>)}</div>}
    {!loading && !error && (page > 0 || events.length >= 100) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={events.length < 100} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}
  </section>;
}

export function StudentEventDetail() {
  const { eventId } = useParams<{ eventId?: string }>();
  const { client, session, profile } = useIdentity();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [registration, setRegistration] = useState<RegistrationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (!client || !session || !eventId) return;
    setLoading(true); setError(""); setEvent(null); setRegistration(null); setMessage("");
    void Promise.all([
      readEvents(client, cacheEnabled, eventId),
      client.from("registrations").select("*").eq("event_id", eventId).eq("user_id", session.user.id).maybeSingle(),
    ]).then(([events, result]) => {
      if (result.error) throw result.error;
      if (active) { setEvent(events[0] ?? null); setRegistration(result.data as RegistrationRecord | null); }
    }).catch((failure: unknown) => { if (active) setError(workflowError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, eventId, version]);
  async function register() {
    if (!client || !event) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await client.rpc("register_for_event", { p_event_id: event.id });
      if (result.error) throw result.error;
      setRegistration(result.data as RegistrationRecord); setMessage("Registration confirmed.");
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  const open = event && event.status === "published" && Date.now() >= Date.parse(event.registration_opens_at) && Date.now() < Date.parse(event.registration_closes_at);
  if (loading) return <p role="status">Loading event…</p>;
  return <section className="workflow-section"><Link href="/events">Back to events</Link>{event ? <article className="workflow-panel"><span className="event-status">{event.status}</span><h1>{event.title}</h1><p className="event-description">{event.description}</p><dl className="event-facts"><dt>When</dt><dd>{date(event.starts_at)} – {date(event.ends_at)}</dd><dt>Venue</dt><dd>{event.venue}</dd><dt>Registration</dt><dd>{date(event.registration_opens_at)} – {date(event.registration_closes_at)}</dd><dt>Capacity</dt><dd>{event.capacity ?? "No capacity limit"}</dd></dl>
    {registration ? <p role="status">You are registered for this event.</p> : <><p>{!isProfileComplete(profile) ? <>Complete your <Link href="/profile">student profile</Link> before registering.</> : open ? "Registration is open. Availability is confirmed when you register." : "Registration is not open for this event."}</p><Button disabled={busy || !open || !isProfileComplete(profile)} onClick={() => void register()}>{busy ? "Registering…" : "Register for event"}</Button></>}
    {message && <p role="status">{message}</p>}</article> : !error ? <h1>Event unavailable</h1> : null}
    {error && <p role="alert">{error}</p>}<Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh event</Button>
  </section>;
}
