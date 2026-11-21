"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";
import { ArrowUpRight, Image, FileText } from "lucide-react";
import { AstronautDoodle } from "../components/space-doodles";

interface Material { id: string; label: string; kind: "gallery" | "resource"; url: string }

export function StudentEventMaterials() {
  const { eventId } = useParams<{ eventId: string }>();
  const { client, session } = useIdentity();
  const [rows, setRows] = useState<Material[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setLoading(true); setError(""); setTitle(null); setRows([]);
    void Promise.all([
      client.from("events").select("title").eq("id", eventId).neq("status", "draft").maybeSingle(),
      client.from("event_materials").select("id,label,kind,url").eq("event_id", eventId)
        .eq("published", true).order("display_order").order("id"),
    ]).then(([event, materials]) => {
      if (event.error) throw event.error;
      if (materials.error) throw materials.error;
      if (active) { setTitle(event.data?.title ?? null); setRows((materials.data ?? []) as Material[]); }
    }).catch((failure: unknown) => { if (active) setError(workflowError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, eventId, version]);

  return <section className="workflow-section materials-page">
    <Link className="back-link" href={`/events/${eventId}`}>← Back to event</Link><span className="eyebrow">FROM THIS EVENT</span><h1>Gallery & resources</h1>
    <p>Open albums and resources shared by TechSpace for this event.</p>
    {loading ? <div className="workflow-panel state-panel" role="status">Loading event links…</div> : error ? <div className="workflow-panel state-panel"><p role="alert">{error}</p></div> : title === null ? <div className="workflow-panel state-panel"><h2>Event unavailable</h2><p>This event’s materials cannot be viewed.</p></div> : <>
      <h2 className="materials-event-title">{title}</h2>
      {!rows.length ? <div className="workflow-panel state-panel illustrated-state"><AstronautDoodle scene="resources" /><div><h2>No links yet</h2><p>Gallery and resource links will appear here when published.</p></div></div> : <div className="material-grid">{rows.map((row) => <article className="workflow-panel material-card" key={row.id}>
        <span className="material-icon">{row.kind === "gallery" ? <Image size={23} aria-hidden="true" /> : <FileText size={23} aria-hidden="true" />}</span><span className="event-status">{row.kind === "gallery" ? "Gallery" : "Resource"}</span>
        <h3>{row.label}</h3><a href={row.url} target="_blank" rel="noopener noreferrer">Open link <ArrowUpRight size={16} /></a>
      </article>)}</div>}
    </>}
    <p className="external-link-note">Links open externally. Access and sharing are controlled by the file or album owner; anyone-with-link materials can be forwarded.</p>
    <Button variant="outline" disabled={loading} onClick={() => setVersion((v) => v + 1)}>Refresh links</Button>
  </section>;
}
