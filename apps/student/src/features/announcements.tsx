"use client";

import { useEffect, useState } from "react";
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

export function StudentAnnouncements() {
  const { client, session } = useIdentity();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    if (!client || !session) return;
    setLoading(true); setError("");
    // Every page is read through RLS; no client-side audience filtering or cache.
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
  return <section className="workflow-section">
    <div className="workflow-heading"><h1>Announcements</h1><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh announcements</Button></div>
    <p>Club notices and updates for your registered events appear here. Drive sharing permissions apply when opening external documents.</p>
    {loading ? <p role="status">Loading announcements…</p> : error ? <p role="alert">{error}</p> : !rows.length ? <p>No announcements on this page yet.</p> : <div className="event-grid">{rows.map((row) => <article className="workflow-panel" key={row.id}>
      <span className="event-status">{row.audience === "all_students" ? "All students" : "Event registrants"}</span>
      <h2>{row.title}</h2><p><time dateTime={row.published_at}>{new Date(row.published_at).toLocaleString()}</time></p>
      <p className="event-description">{row.body}</p>
      <div className="workflow-actions">{row.event_id && <Link href={`/events/${row.event_id}`}>View event</Link>}{row.link_url && <a href={row.link_url} target="_blank" rel="noopener noreferrer">Open linked resource</a>}</div>
    </article>)}</div>}
    {!loading && !error && (page > 0 || rows.length === 50) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={rows.length < 50} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}
  </section>;
}
