"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CalendarDays, MapPin, Orbit, Search } from "lucide-react";
import { Button } from "@launchpad/ui";
import { isProfileComplete, readEvents, useIdentity, workflowError, type EventRecord, type RegistrationRecord } from "@launchpad/supabase";

import { StudentEventQr } from "./attendance";
import { AstronautDoodle } from "../components/space-doodles";

const cacheEnabled = process.env.NEXT_PUBLIC_MAIN_EVENTS_CACHE_ENABLED === "true";
const date = (value: string) => new Date(value).toLocaleString();

export function StudentEvents({ mine = false }: { mine?: boolean }) {
  const { client, session } = useIdentity();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<"all" | "upcoming" | "past">("all");
  const [attendanceByEvent, setAttendanceByEvent] = useState<Record<string, boolean>>({});
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
          const [result, attendance] = await Promise.all([
            client.from("events").select("*").in("id", ids).order("starts_at"),
            client.from("attendance").select("event_id,checked_in").eq("user_id", session.user.id).in("event_id", ids),
          ]);
          if (result.error) throw result.error;
          if (attendance.error) throw attendance.error;
          rows = result.data as EventRecord[];
          if (active) setAttendanceByEvent(Object.fromEntries((attendance.data ?? []).map((row: { event_id: string; checked_in: boolean }) => [row.event_id, row.checked_in])));
        }
      } else rows = await readEvents(client, cacheEnabled, undefined, page * 100);
      if (active) setEvents(rows);
    })().catch((failure: unknown) => { if (active) setError(workflowError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, mine, version, page]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEvents = events.filter((event) => {
    const matchesQuery = !normalizedQuery || `${event.title} ${event.description} ${event.venue}`.toLocaleLowerCase().includes(normalizedQuery);
    const upcoming = Date.parse(event.ends_at) >= Date.now();
    return matchesQuery && (timeFilter === "all" || (timeFilter === "upcoming" ? upcoming : !upcoming));
  });
  return <section className="workflow-section events-page"><div className="workflow-heading events-heading"><div><span className="eyebrow">{mine ? "YOUR EVENT RECORD" : "FIND YOUR NEXT MOMENT"}</span><h1>{mine ? "My events" : "Explore events"}</h1><p>{mine ? "Everything you joined, ready when you need it." : "Discover what’s happening around TechSpace."}</p></div><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh</Button></div>
    <div className="event-filters"><label className="event-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Search events on this page</span><input id="event-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, workshops, hackathons..." /></label><div className="event-filter-tabs" role="group" aria-label="Filter events by date"><button type="button" aria-pressed={timeFilter === "all"} onClick={() => setTimeFilter("all")}>All</button><button type="button" aria-pressed={timeFilter === "upcoming"} onClick={() => setTimeFilter("upcoming")}>Upcoming</button><button type="button" aria-pressed={timeFilter === "past"} onClick={() => setTimeFilter("past")}>Past</button></div></div>
    {loading ? <div className="workflow-panel state-panel" role="status">Loading events…</div> : error ? <div className="workflow-panel state-panel"><p role="alert">{error}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Retry</Button></div> : !visibleEvents.length ? <div className="workflow-panel event-empty"><AstronautDoodle scene={mine ? "flag" : "telescope"} /><div><h2>{query || timeFilter !== "all" ? "No events match your filters." : mine ? "Your story starts here." : "Nothing on the calendar yet."}</h2><p>{query || timeFilter !== "all" ? "Try a different search or date filter." : mine ? "Join an event and it will appear here with your QR and check-in details." : "Published TechSpace events will show up here. Check back soon."}</p>{mine && !query && timeFilter === "all" && <Button asChild><Link href="/events">Explore events <ArrowRight size={16} /></Link></Button>}</div></div> : <div className="event-grid student-event-grid">{visibleEvents.map((event) => <article className="workflow-panel student-event-card" key={event.id}><div className="student-event-card-top"><span className="event-status">{mine ? attendanceByEvent[event.id] ? "Checked in" : "Registered" : event.status}</span><Orbit size={20} aria-hidden="true" /></div><h2><Link href={`/events/${event.id}`}>{event.title}</Link></h2><div className="event-card-meta"><span><CalendarDays size={15} aria-hidden="true" />{date(event.starts_at)}</span><span><MapPin size={15} aria-hidden="true" />{event.venue}</span></div><div className="event-card-links"><Link className="event-card-link" href={`/events/${event.id}`}>View event <ArrowRight size={16} /></Link>{mine && <Link className="event-card-link" href={`/my-events/${event.id}/pass`}>View QR pass <ArrowRight size={16} /></Link>}</div></article>)}</div>}
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
  if (loading) return <section className="workflow-section"><div className="workflow-panel state-panel" role="status">Loading event…</div></section>;
  return <section className="workflow-section event-detail-page"><Link className="back-link" href="/events">← Back to events</Link>{event ? <article className="workflow-panel event-detail-card"><div className="event-detail-intro"><span className="event-status">{event.status}</span><h1>{event.title}</h1><p className="event-description">{event.description}</p></div><div className="event-detail-layout"><div><h2>Event details</h2><dl className="event-facts"><dt>When</dt><dd>{date(event.starts_at)} – {date(event.ends_at)}</dd><dt>Venue</dt><dd>{event.venue}</dd><dt>Registration</dt><dd>{date(event.registration_opens_at)} – {date(event.registration_closes_at)}</dd><dt>Capacity</dt><dd>{event.capacity ?? "No capacity limit"}</dd></dl><Link className="event-materials-link" href={`/events/${event.id}/materials`}>Gallery & resources <ArrowRight size={16} /></Link></div><aside className="event-registration-panel"><h2>{registration ? "You’re going" : "Join this event"}</h2>
    {registration ? (
      <>
        <p role="status">You are registered for this event.</p>
        {Date.parse(event.ends_at) >= Date.now() ? <><Button asChild><Link href={`/my-events/${event.id}/pass`}>Open QR pass <ArrowRight size={16} /></Link></Button><StudentEventQr eventId={event.id} /></> : <p>This event has ended. Your pass is no longer available.</p>}
      </>
    ) : <><p>{!isProfileComplete(profile) ? <>Complete your <Link href="/profile">student profile</Link> before registering.</> : open ? "Registration is open. Availability is confirmed when you register." : "Registration is not open for this event."}</p><Button disabled={busy || !open || !isProfileComplete(profile)} onClick={() => void register()}>{busy ? "Registering…" : "Register for event"}</Button></>}
    {message && <p role="status">{message}</p>}</aside></div></article> : !error ? <div className="workflow-panel state-panel"><h1>Event unavailable</h1><p>This event is not available to view.</p></div> : null}
    {error && <p role="alert">{error}</p>}<Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh event</Button>
  </section>;
}
