"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";
import { Bell, ArrowUpRight } from "lucide-react";
import { AstronautDoodle } from "../components/space-doodles";

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
  return <section className="workflow-section announcements-page">
    <div className="workflow-heading"><div><span className="eyebrow">IN THE LOOP</span><h1>Announcements</h1><p>Club news and updates for your events.</p></div><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh</Button></div>
    {loading ? <div className="workflow-panel state-panel" role="status">Loading announcements…</div> : error ? <div className="workflow-panel state-panel"><p role="alert">{error}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Retry</Button></div> : !rows.length ? <div className="workflow-panel state-panel illustrated-state"><AstronautDoodle scene="megaphone" /><div><h2>No announcements yet</h2><p>Updates from TechSpace and the events you join will appear here.</p></div></div> : <div className="event-grid announcement-grid">{rows.map((row) => <article className="workflow-panel announcement-card" key={row.id}>
      <div className="announcement-card-top"><span className="event-status">{row.audience === "all_students" ? "All students" : "Event registrants"}</span><Bell size={18} aria-hidden="true" /></div>
      <h2>{row.title}</h2><p><time dateTime={row.published_at}>{new Date(row.published_at).toLocaleString()}</time></p>
      <p className="event-description">{row.body}</p>
      <div className="workflow-actions">{row.event_id && <Link href={`/events/${row.event_id}`}>View event</Link>}{row.link_url && <a href={row.link_url} target="_blank" rel="noopener noreferrer">Open linked resource <ArrowUpRight size={15} /></a>}</div>
    </article>)}</div>}
    <p className="external-link-note">External Drive and album links use the sharing permissions set by their owners.</p>
    {!loading && !error && (page > 0 || rows.length === 50) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={rows.length < 50} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}
  </section>;
}
