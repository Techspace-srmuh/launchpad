"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

interface Announcement {
  id: string;
  event_id: string | null;
  title: string;
  body: string;
  link_url: string | null;
  audience: "all_students" | "event_registrants";
  published_at: string;
}
interface EventOption { id: string; title: string; }

function publishError(failure: unknown): string {
  const message = failure && typeof failure === "object" && "message" in failure ? String(failure.message) : "";
  if (message.includes("INVALID_ANNOUNCEMENT_LINK")) return "Enter a valid HTTPS link without credentials, spaces or backslashes.";
  if (message.includes("ANNOUNCEMENT_EVENT_REQUIRED")) return "Choose an event for an event-registrant announcement.";
  if (message.includes("ANNOUNCEMENT_EVENT_UNAVAILABLE")) return "Choose an event that has been published. Draft or missing events cannot be used.";
  if (message.includes("INVALID_ANNOUNCEMENT")) return "Enter a title (up to 160 characters), message (up to 10,000 characters) and audience.";
  return workflowError(failure);
}

export function AdminAnnouncements() {
  const { client, session } = useIdentity();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [eventPage, setEventPage] = useState(0);
  const [eventId, setEventId] = useState("");
  const [audience, setAudience] = useState("all_students");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setLoading(true); setError("");
    void Promise.resolve(client.from("announcements").select("id,event_id,title,body,link_url,audience,published_at")
      .order("published_at", { ascending: false }).order("id", { ascending: false })
      .range(page * 50, page * 50 + 49)).then(({ data, error: failure }) => {
        if (!active) return;
        if (failure) { setError(workflowError(failure)); setRows([]); }
        else setRows((data ?? []) as Announcement[]);
      }).catch((failure: unknown) => {
        if (active) { setError(workflowError(failure)); setRows([]); }
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, page, version]);
  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setEventsLoading(true); setEventsError("");
    void Promise.resolve(client.from("events").select("id,title").neq("status", "draft")
      .order("starts_at", { ascending: false }).order("id").range(eventPage * 100, eventPage * 100 + 99))
      .then(({ data, error: failure }) => {
        if (!active) return;
        if (failure) { setEventsError(workflowError(failure)); setEvents([]); }
        else setEvents((data ?? []) as EventOption[]);
      }).catch((failure: unknown) => {
        if (active) { setEventsError(workflowError(failure)); setEvents([]); }
      }).finally(() => { if (active) setEventsLoading(false); });
    return () => { active = false; };
  }, [client, session, eventPage, version]);
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setSubmitError(""); setMessage("");
    try {
      const result = await client.rpc("admin_publish_announcement", {
        p_title: String(values.get("title") ?? "").trim(), p_body: String(values.get("body") ?? "").trim(),
        p_audience: audience, p_event_id: eventId || null, p_link_url: String(values.get("link_url") ?? "").trim() || null,
      });
      if (result.error) throw result.error;
      form.reset(); setAudience("all_students"); setEventId(""); setPage(0);
      setMessage("Announcement published to the dashboard. Email was not sent.");
      setVersion((value) => value + 1);
    } catch (failure) { setSubmitError(publishError(failure)); }
    finally { setBusy(false); }
  }
  return <section className="workflow-section">
    <div className="workflow-heading"><h1>Announcements</h1><Button variant="outline" disabled={busy} onClick={() => setVersion((value) => value + 1)}>Refresh announcements</Button></div>
    <div className="workflow-panel"><h2>Publish a dashboard announcement</h2><p>Publishing makes this notice visible to its audience immediately. Email delivery is not available yet.</p>
      <form className="workflow-form" onSubmit={(event) => void publish(event)}>
        <label>Title<input name="title" required maxLength={160} disabled={busy} /></label>
        <label>Message<textarea name="body" required maxLength={10000} rows={5} disabled={busy} /></label>
        <label>Audience<select aria-label="Audience" value={audience} disabled={busy} onChange={(event) => setAudience(event.target.value)}><option value="all_students">All students</option><option value="event_registrants">Event registrants</option></select></label>
        <label>Event (optional unless registrants)<select aria-label="Event" value={eventId} required={audience === "event_registrants"} disabled={busy || eventsLoading || Boolean(eventsError)} onChange={(event) => setEventId(event.target.value)}><option value="">Choose event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
        {eventsLoading ? <p role="status">Loading events…</p> : eventsError ? <p role="alert">{eventsError} Use Refresh announcements to retry.</p> : !events.length ? <p>No published events on this page. <Link href="/events">Manage events</Link>.</p> : null}
        {(eventPage > 0 || events.length === 100) && <div className="workflow-actions"><Button type="button" variant="outline" disabled={busy || eventsLoading || eventPage === 0} onClick={() => { setEventPage((value) => value - 1); setEventId(""); }}>Previous events</Button><span>Event page {eventPage + 1}</span><Button type="button" variant="outline" disabled={busy || eventsLoading || events.length < 100} onClick={() => { setEventPage((value) => value + 1); setEventId(""); }}>More events</Button></div>}
        <label>Link URL (optional)<input aria-label="Link URL" name="link_url" type="url" maxLength={2048} placeholder="https://" disabled={busy} aria-describedby="announcement-link-help" /></label>
        <p id="announcement-link-help">For a common signed OD, choose its event and paste the existing Google Drive PDF link here. Everyone uses the same file; this app does not upload or copy it. External sharing permissions still apply.</p>
        <Button type="submit" disabled={busy || (audience === "event_registrants" && (!eventId || eventsLoading || Boolean(eventsError)))}>{busy ? "Publishing…" : "Publish announcement"}</Button>
      </form>{submitError && <p role="alert">{submitError}</p>}{message && <p role="status">{message}</p>}
    </div>
    <h2>Published announcements</h2>
    {loading ? <p role="status">Loading announcements…</p> : error ? <p role="alert">{error}</p> : !rows.length ? <p>No announcements on this page yet.</p> : <div className="event-grid">{rows.map((row) => <article className="workflow-panel" key={row.id}>
      <span className="event-status">{row.audience === "all_students" ? "All students" : "Event registrants"}</span><h3>{row.title}</h3><p><time dateTime={row.published_at}>{new Date(row.published_at).toLocaleString()}</time></p><p className="event-description">{row.body}</p>
      <div className="workflow-actions">{row.event_id && <Link href={`/events/${row.event_id}/participants`}>View event participants</Link>}{row.link_url && <a href={row.link_url} target="_blank" rel="noopener noreferrer">Open linked resource</a>}</div>
    </article>)}</div>}
    {!loading && !error && (page > 0 || rows.length === 50) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={rows.length < 50} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}
  </section>;
}
