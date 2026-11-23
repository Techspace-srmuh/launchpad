"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";
import { Bell, ArrowUpRight, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<"all" | Announcement["audience"]>("all");
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
  const search = query.trim().toLocaleLowerCase();
  const visibleRows = rows.filter((row) => (audienceFilter === "all" || row.audience === audienceFilter) && (!search || `${row.title} ${row.body}`.toLocaleLowerCase().includes(search)));
  return <section className="workflow-section announcements-page">
    <div className="workflow-heading"><div><span className="eyebrow">IN THE LOOP</span><h1>Announcements</h1><p>Club news and updates for your events.</p></div><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Refresh</Button></div>
    <div className="event-filters"><label className="event-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Search announcements on this page</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search announcements on this page..." /></label><div className="event-filter-tabs" role="group" aria-label="Filter announcements by audience"><button type="button" aria-pressed={audienceFilter === "all"} onClick={() => setAudienceFilter("all")}>All updates</button><button type="button" aria-pressed={audienceFilter === "all_students"} onClick={() => setAudienceFilter("all_students")}>Club-wide</button><button type="button" aria-pressed={audienceFilter === "event_registrants"} onClick={() => setAudienceFilter("event_registrants")}>My events</button></div></div>
    {!loading && !error && <p className="results-summary" role="status">Showing {visibleRows.length} of {rows.length} announcements on this page.</p>}
    {loading ? <div className="workflow-panel state-panel" role="status">Loading announcements…</div> : error ? <div className="workflow-panel state-panel"><p role="alert">{error}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Retry</Button></div> : !visibleRows.length ? <div className="workflow-panel state-panel illustrated-state"><AstronautDoodle scene="megaphone" /><div><h2>{query || audienceFilter !== "all" ? "No announcements match your filters" : "No announcements yet"}</h2><p>{query || audienceFilter !== "all" ? "Try another search or audience filter." : "Updates from TechSpace and the events you join will appear here."}</p></div></div> : <div className="event-grid announcement-grid">{visibleRows.map((row) => <article id={`announcement-${row.id}`} className="workflow-panel announcement-card" key={row.id}>
      <div className="announcement-card-top"><span className="event-status">{row.audience === "all_students" ? "All students" : "Event registrants"}</span><Bell size={18} aria-hidden="true" /></div>
      <h2>{row.title}</h2><p><time dateTime={row.published_at}>{new Date(row.published_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</time></p>
      <p className="event-description">{row.body}</p>
      <div className="workflow-actions">{row.event_id && <Link href={`/events/${row.event_id}`}>View event</Link>}{row.link_url && <a href={row.link_url} target="_blank" rel="noopener noreferrer">Open linked resource <ArrowUpRight size={15} /></a>}</div>
    </article>)}</div>}
    <p className="external-link-note">External Drive and album links use the sharing permissions set by their owners.</p>
    {!loading && !error && (page > 0 || rows.length === 50) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={rows.length < 50} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}
  </section>;
}
