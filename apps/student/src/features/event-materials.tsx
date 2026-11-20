"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

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

  return <section className="workflow-section">
    <Link href="/events">Back to events</Link><h1>Gallery & resources</h1>
    <p>Links open externally. Access and sharing are controlled by the file or album owner; anyone-with-link materials can be forwarded.</p>
    {loading ? <p role="status">Loading event links…</p> : error ? <p role="alert">{error}</p> : title === null ? <p>Event unavailable.</p> : <>
      <h2>{title}</h2>
      {!rows.length ? <p>No gallery or resource links have been published for this event yet.</p> : rows.map((row) => <article className="workflow-panel" key={row.id}>
        <h3><a href={row.url} target="_blank" rel="noopener noreferrer">{row.label}</a></h3>
        <p>{row.kind === "gallery" ? "Google Photos album" : "Resource"}</p>
      </article>)}
    </>}
    <Button variant="outline" disabled={loading} onClick={() => setVersion((v) => v + 1)}>Refresh links</Button>
  </section>;
}
