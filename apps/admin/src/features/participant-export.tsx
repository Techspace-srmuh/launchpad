"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";
import { participantCsv, participantExportFilename, type ParticipantExportRow } from "../lib/participant-csv";

type Filters = { department: string; year: string; search: string };
type Snapshot = { count: number; rows: ParticipantExportRow[]; generated_at: string };
const emptyFilters: Filters = { department: "", year: "", search: "" };
function exportError(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : typeof failure === "object" && failure !== null && "message" in failure ? String(failure.message) : "";
  if (message.includes("EXPORT_TOO_LARGE")) return "This export is too large. Narrow the filters to at most 10,000 participants and try again.";
  if (message.includes("ADMIN_REQUIRED")) return "Your admin access is no longer active. Open your account to check access.";
  if (message.includes("EVENT_UNAVAILABLE")) return "This event is unavailable.";
  return workflowError(failure);
}

export function ParticipantExport() {
  const { eventId } = useParams<{ eventId: string }>();
  const { client } = useIdentity();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (!client) return;
    setLoading(true); setSnapshot(null); setError(""); setStatus("");
    void (async () => {
      participantExportFilename(eventId);
      const result = await client.rpc("admin_event_participant_export", { p_event_id: eventId, p_department: filters.department || null, p_academic_year: filters.year ? Number(filters.year) : null, p_search: filters.search || null, p_download: false });
      if (result.error) throw result.error;
      const data = result.data as Snapshot;
      if (!data || !Number.isInteger(data.count) || !Array.isArray(data.rows)) throw new Error("Invalid export response");
      if (active) setSnapshot(data);
    })().catch((failure: unknown) => { if (active) setError(exportError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, eventId, filters, version]);
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFilters({ department: draft.department.trim(), year: draft.year, search: draft.search.trim() });
  }
  async function download() {
    if (!client || busy) return;
    setBusy(true); setError(""); setStatus("Preparing the complete participant snapshot…");
    try {
      const filename = participantExportFilename(eventId);
      const result = await client.rpc("admin_event_participant_export", { p_event_id: eventId, p_department: filters.department || null, p_academic_year: filters.year ? Number(filters.year) : null, p_search: filters.search || null, p_download: true });
      if (result.error) throw result.error;
      const data = result.data as Snapshot;
      if (!data || !Number.isInteger(data.count) || data.count < 0 || data.count > 10000 || !Array.isArray(data.rows) || data.rows.length !== data.count) throw new Error("Incomplete export response; no file was downloaded");
      if (!mounted.current) return;
      setSnapshot({ ...data, rows: data.rows.slice(0, 10) });
      if (!data.count) { setStatus("No participants match these filters. No file was downloaded."); return; }
      const url = URL.createObjectURL(new Blob([participantCsv(data.rows)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      try { anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); }
      finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setStatus(`Download started for ${data.count} participants. The export preparation was audited.`);
    } catch (failure) { if (mounted.current) { setError(exportError(failure)); setStatus(""); } }
    finally { if (mounted.current) setBusy(false); }
  }
  const unapplied = draft.department.trim() !== filters.department || draft.year !== filters.year || draft.search.trim() !== filters.search;
  return <section className="workflow-section">
    <Link href={`/events/${eventId}/participants`}>Back to participants</Link><h1>Export participants</h1>
    <p>Exports name, registration number, course, branch, department, section, academic year and registration time. Contact details and QR credentials are excluded.</p>
    <div className="workflow-panel"><form className="workflow-form" onSubmit={preview}><fieldset disabled={busy} className="workflow-form"><legend>Participant filters</legend>
      <label>Department (exact match)<input maxLength={120} value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} /></label>
      <label>Academic year<select aria-label="Academic year" value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })}><option value="">All years</option>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
      <label>Name or registration number<input maxLength={120} value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></label>
      <p>Department and search ignore case. Search matches literal text within a name or registration number.</p>
      <div className="workflow-actions"><Button type="submit" disabled={loading}>Preview participants</Button><Button type="button" variant="outline" onClick={() => { setDraft(emptyFilters); setFilters({ ...emptyFilters }); }}>Clear filters</Button></div>
    </fieldset></form></div>
    <p>Preview shows up to 10 rows. Downloads include every matching participant, up to 10,000 rows and 16 MiB. Narrow filters for larger events. Each request reads a fresh snapshot, so registrations or profile changes after preview can change the download count.</p>
    {loading ? <p role="status">Loading participant preview…</p> : snapshot && <><p role="status">{snapshot.count} matching participants</p>{snapshot.count === 0 ? <p>No participants match these filters.</p> : <div className="table-scroll"><table><thead><tr><th scope="col">Student</th><th scope="col">Registration number</th><th scope="col">Department</th><th scope="col">Academic year</th></tr></thead><tbody>{snapshot.rows.map((row) => <tr key={row.roll_number}><td>{row.full_name}</td><td>{row.roll_number}</td><td>{row.department}</td><td>{row.academic_year}</td></tr>)}</tbody></table></div>}</>}
    {unapplied && <p>Preview your changed filters before downloading.</p>}
    {error && <div><p role="alert">{error}</p><Button variant="outline" disabled={loading || busy} onClick={() => setVersion((value) => value + 1)}>Retry preview</Button></div>}
    <Button disabled={loading || busy || unapplied || !snapshot?.count} onClick={() => void download()}>{busy ? "Preparing CSV…" : "Download CSV"}</Button>
    {status && <p role="status">{status}</p>}
    <p>CSV uses UTF-8 with an Excel-compatible marker. Spreadsheet formula-like text is prefixed with an apostrophe in the downloaded file; stored profiles are unchanged.</p>
  </section>;
}
