"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@launchpad/ui";
import { readEvents, useIdentity, workflowError, type EventRecord, type EventStatus, type ProfileRecord, type RegistrationRecord } from "@launchpad/supabase";

const date = (value: string) => new Date(value).toLocaleString();
const localDate = (value: string) => {
  const parsed = new Date(value);
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function AdminEvents() {
  const searchParams = useSearchParams();
  const { client } = useIdentity();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    if (!client) return;
    setLoading(true); setError("");
    void readEvents(client, false, undefined, page * 100).then((rows) => { if (active) setEvents(rows); }).catch((failure: unknown) => { if (active) setError(workflowError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, version, page]);
  return <section className="workflow-section"><div className="workflow-heading"><h1>Events</h1><div className="workflow-actions"><Button asChild><Link href="/events/new">New event</Link></Button><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh events</Button></div></div>
    {searchParams.get("saved") === "1" && <p role="status">Event saved.</p>}{loading ? <p role="status">Loading events…</p> : error ? <p role="alert">{error}</p> : !events.length ? <p>No events yet. Create your first event.</p> : <div className="event-grid">{events.map((event) => <article key={event.id} className="workflow-panel"><span className="event-status">{event.status}</span><h2>{event.title}</h2><p>{date(event.starts_at)}</p><p>{event.venue}</p><div className="workflow-actions"><Link href={`/events/${event.id}/edit`}>Edit event</Link><Link href={`/events/${event.id}/participants`}>View participants</Link><Link href={`/events/${event.id}/materials`}>Gallery & resources</Link><Link href={`/events/${event.id}/export`}>Export CSV</Link><Link href={`/events/${event.id}/attendance`}>Scan attendance</Link></div></article>)}</div>}
    {!loading && !error && (page > 0 || events.length >= 100) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={events.length < 100} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}
  </section>;
}

export function EventEditor() {
  const { eventId } = useParams<{ eventId?: string }>();
  const { client } = useIdentity();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    setError(""); setEvent(null);
    if (!eventId || !client) { setLoading(false); return; }
    setLoading(true);
    void readEvents(client, false, eventId).then((rows) => { if (active) setEvent(rows[0] ?? null); }).catch((failure: unknown) => { if (active) setError(workflowError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, eventId, version]);
  async function save(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (!client) return;
    const values = new FormData(submission.currentTarget);
    const get = (name: string) => String(values.get(name) ?? "").trim();
    setBusy(true); setError("");
    try {
      const payload = { ...(eventId ? { id: eventId } : {}), title: get("title"), description: get("description"), poster_url: get("poster_url") || null, venue: get("venue"), starts_at: new Date(get("starts_at")).toISOString(), ends_at: new Date(get("ends_at")).toISOString(), registration_opens_at: new Date(get("registration_opens_at")).toISOString(), registration_closes_at: new Date(get("registration_closes_at")).toISOString(), capacity: get("capacity") ? Number(get("capacity")) : null, status: get("status") as EventStatus };
      const result = await client.rpc("admin_save_event", { p_event: payload });
      if (result.error) throw result.error;
      router.push("/events?saved=1");
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">Loading event…</p>;
  if (eventId && !event) return <section className="workflow-panel"><h1>Event unavailable</h1>{error && <p role="alert">{error}</p>}<Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Retry</Button><Link href="/events">Back to events</Link></section>;
  return <section className="workflow-section"><Link href="/events">Back to events</Link><div className="workflow-panel"><h1>{eventId ? "Edit event" : "Create event"}</h1><p>Times use your current device time zone. Published events are visible to signed-in students. Registration rules are enforced by the database.</p>
    <form key={eventId ?? "new"} onSubmit={(submission) => void save(submission)} className="workflow-form event-form"><label>Title<input name="title" required maxLength={160} defaultValue={event?.title ?? ""} /></label><label>Description<textarea name="description" required maxLength={10000} rows={5} defaultValue={event?.description ?? ""} /></label><label>Poster URL (optional)<input name="poster_url" type="url" placeholder="https://" defaultValue={event?.poster_url ?? ""} /></label><label>Venue<input name="venue" required maxLength={200} defaultValue={event?.venue ?? ""} /></label><div className="form-columns"><label>Starts at<input name="starts_at" type="datetime-local" required defaultValue={event ? localDate(event.starts_at) : ""} /></label><label>Ends at<input name="ends_at" type="datetime-local" required defaultValue={event ? localDate(event.ends_at) : ""} /></label><label>Registration opens<input name="registration_opens_at" type="datetime-local" required defaultValue={event ? localDate(event.registration_opens_at) : ""} /></label><label>Registration closes<input name="registration_closes_at" type="datetime-local" required defaultValue={event ? localDate(event.registration_closes_at) : ""} /></label></div><label>Capacity<input name="capacity" aria-label="Capacity" aria-describedby="capacity-help" type="number" min="1" step="1" defaultValue={event?.capacity ?? ""} /><span id="capacity-help">Leave blank for no capacity limit.</span></label><label>Status<select aria-label="Status" name="status" defaultValue={event?.status ?? "draft"}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save event"}</Button></form>{error && <p role="alert">{error}</p>}
  </div></section>;
}

export function EventParticipants() {
  const { eventId } = useParams<{ eventId?: string }>();
  const { client } = useIdentity();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let active = true;
    if (!client || !eventId) return;
    setLoading(true); setError("");
    void (async () => {
      const [events, result] = await Promise.all([readEvents(client, false, eventId), client.from("registrations").select("*", { count: "exact" }).eq("event_id", eventId).order("created_at").order("id").range(page * 100, page * 100 + 99)]);
      if (result.error) throw result.error;
      const rows = result.data as RegistrationRecord[];
      let people: ProfileRecord[] = [];
      if (rows.length) {
        const profileResult = await client.from("profiles").select("*").in("user_id", rows.map((row) => row.user_id));
        if (profileResult.error) throw profileResult.error;
        people = profileResult.data as ProfileRecord[];
      }
      if (active) { setEvent(events[0] ?? null); setRegistrations(rows); setProfiles(people); setTotal(result.count ?? 0); }
    })().catch((failure: unknown) => { if (active) setError(workflowError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, eventId, version, page]);
  return <section className="workflow-section"><Link href="/events">Back to events</Link><div className="workflow-heading"><h1>Participants</h1><Button asChild variant="outline"><Link href={`/events/${eventId}/export`}>Export CSV</Link></Button><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh participants</Button></div>{loading ? <p role="status">Loading participants…</p> : error ? <p role="alert">{error}</p> : !event ? <p>Event unavailable.</p> : <><h2>{event.title}</h2><p>{total} registrations{event.capacity ? ` · Capacity ${event.capacity}` : ""}</p>{!registrations.length ? <p>No registrations on this page.</p> : <div className="table-scroll"><table><thead><tr><th scope="col">Student</th><th scope="col">Roll number</th><th scope="col">Registered</th></tr></thead><tbody>{registrations.map((registration) => { const person = profiles.find((profile) => profile.user_id === registration.user_id); return <tr key={registration.id}><td>{person?.full_name ?? "Profile unavailable"}</td><td>{person?.roll_number ?? "—"}</td><td>{date(registration.created_at)}</td></tr>; })}</tbody></table></div>}{(page > 0 || total > 100) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={(page + 1) * 100 >= total} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}</>}</section>;
}
