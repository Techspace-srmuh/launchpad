"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { useIdentity, workflowError, type EventRecord } from "@launchpad/supabase";
import { StudentEventQr } from "./attendance";

export function StudentEventPass() {
  const { eventId } = useParams<{ eventId: string }>();
  const { client, session, profile } = useIdentity();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!client || !session || !eventId) return;
    setLoading(true);
    setError("");
    void Promise.all([
      client.from("events").select("*").eq("id", eventId).maybeSingle(),
      client.from("registrations").select("id").eq("event_id", eventId).eq("user_id", session.user.id).maybeSingle(),
    ]).then(([eventResult, registrationResult]) => {
      if (eventResult.error) throw eventResult.error;
      if (registrationResult.error) throw registrationResult.error;
      if (active) { setEvent(eventResult.data as EventRecord | null); setRegistered(Boolean(registrationResult.data)); }
    }).catch((failure: unknown) => { if (active) setError(workflowError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, eventId]);

  const ended = event ? Date.parse(event.ends_at) < Date.now() : false;
  return <section className="workflow-section pass-page"><Link className="back-link" href="/my-events"><ArrowLeft size={16} /> Back to my events</Link><span className="eyebrow">YOUR EVENT CREDENTIAL</span><h1>Event QR pass</h1>
    {loading ? <div className="workflow-panel state-panel" role="status">Loading your pass…</div> : error ? <div className="workflow-panel state-panel"><p role="alert">{error}</p></div> : !event || !registered ? <div className="workflow-panel state-panel"><h2>Pass unavailable</h2><p>Only students registered for this event can view its QR pass.</p><Link href="/my-events">View my events</Link></div> : ended ? <div className="workflow-panel state-panel"><h2>This event has ended</h2><p>Your event pass is no longer available. You can still view the event and your attendance record.</p><Link href={`/events/${event.id}`}>View event</Link></div> : <div className="pass-layout"><div className="workflow-panel pass-summary"><span className="event-status">Registered</span><h2>{event.title}</h2><p>{profile?.full_name || "Student"}</p><div className="pass-facts"><span><CalendarDays size={17} />{new Date(event.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</span><span><MapPin size={17} />{event.venue}</span></div><p>Show this QR to the event organizer at check-in.</p></div><StudentEventQr eventId={event.id} /></div>}
  </section>;
}
