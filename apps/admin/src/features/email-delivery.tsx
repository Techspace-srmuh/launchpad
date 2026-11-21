"use client";

import { useEffect, useState, type FormEvent } from "react";
import { emailTemplateError, renderEmailTemplate, useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

interface Notice { id: string; title: string; body: string; event_id: string | null; link_url: string | null; audience: string }
interface Campaign { id: string; announcement_id: string; total: number; accepted: number; queued: number; failed: number; unknown: number; cancelled: number }
interface Progress { campaigns: Campaign[]; worker: { last_seen_at: string | null; next_batch_at: string; last_error: string | null } }
interface JobStatus { id: string; full_name: string; recipient: string; status: string; attempts: number; last_error: string | null; next_attempt_at: string }

function emailError(error: unknown): string {
  const message = workflowError(error);
  if (/EMAIL_ALREADY_QUEUED/.test(message)) return "This notice already has an email campaign. Refresh progress; it cannot be sent again as a new campaign.";
  if (/UNKNOWN_EMAIL_PLACEHOLDER|INVALID_EMAIL_TEMPLATE/.test(message)) return "Check your subject, message and supported placeholders.";
  if (/EMAIL_EVENT_REQUIRED/.test(message)) return "Event placeholders require an event on the announcement.";
  if (/EMAIL_LINK_REQUIRED/.test(message)) return "The link placeholder requires a link on the announcement.";
  if (/EMAIL_RETRY_REASON_REQUIRED/.test(message)) return "Enter a retry reason between 3 and 500 characters.";
  return message;
}

function EmailComposer({ notice, onQueued }: { notice: Notice; onQueued: () => void }) {
  const { client, session, profile } = useIdentity();
  const [subject, setSubject] = useState(notice.title);
  const [body, setBody] = useState(`Hello {name},\n\n${notice.body}${notice.link_url ? "\n\n{link}" : ""}`);
  const [event, setEvent] = useState<{ title: string; starts_at: string } | null>(null);
  const [eventLoading, setEventLoading] = useState(Boolean(notice.event_id));
  const [eventVersion, setEventVersion] = useState(0);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    if (!client || !notice.event_id) return;
    setEventLoading(true); setError("");
    void Promise.resolve(client.from("events").select("title,starts_at").eq("id", notice.event_id).single())
      .then(({ data, error: failure }) => { if (active) { if (failure) setError(workflowError(failure)); else setEvent(data); } })
      .catch((failure: unknown) => { if (active) setError(workflowError(failure)); })
      .finally(() => { if (active) setEventLoading(false); });
    return () => { active = false; };
  }, [client, notice.event_id, eventVersion]);
  const validation = emailTemplateError(subject, body, Boolean(notice.event_id), Boolean(notice.link_url));
  const values = {
    name: profile?.full_name || "Sample Student",
    event_name: event?.title,
    event_date: event ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(event.starts_at)).replace(",", "") + " IST" : "",
    link: notice.link_url || "",
  };
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client || !session || busy || validation || !preview) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const { error: failure } = await client.rpc("admin_queue_announcement_email", { p_announcement_id: notice.id, p_subject: subject.trim(), p_body: body.trim() });
      if (failure) throw failure;
      setMessage("Emails queued. The background worker sends them individually in batches of 10. You can leave this page.");
      onQueued();
    } catch (failure) { setError(emailError(failure)); }
    finally { setBusy(false); }
  }
  return <form className="workflow-form" onSubmit={(e) => void send(e)} onChange={() => { setPreview(false); setMessage(""); }}>
    <p>Audience: <strong>{notice.audience === "all_students" ? "All confirmed accounts with student profiles" : "Confirmed event registrants"}</strong>. Recipients are captured when you send. This does not select winners or change registrations.</p>
    <label>Email subject<input value={subject} maxLength={160} required disabled={busy} onChange={(e) => setSubject(e.target.value)} /></label>
    <label>Email message<textarea aria-label="Email message" value={body} maxLength={10000} rows={7} required disabled={busy} onChange={(e) => setBody(e.target.value)} /></label>
    <p>Use {"{name}"}, {"{event_name}"}, {"{event_date}"} or {"{link}"}. Event dates use India time. Messages are plain text; names are filled in separately for each student.</p>
    {eventLoading ? <p role="status">Loading event for preview…</p> : null}
    {notice.event_id && !event && !eventLoading ? <Button type="button" variant="outline" onClick={() => setEventVersion((v) => v + 1)}>Reload event details</Button> : null}
    {validation ? <p role="status">{validation}</p> : null}
    <Button type="button" variant="outline" disabled={busy || Boolean(validation) || eventLoading || Boolean(notice.event_id && !event)} onClick={() => setPreview(true)}>Preview email</Button>
    {preview ? <div className="workflow-panel" aria-label="Email preview"><p>Sample preview using your profile name; each recipient gets their own name.</p><h3>{renderEmailTemplate(subject.trim(), values)}</h3><p className="event-description">{renderEmailTemplate(body.trim(), values)}</p></div> : null}
    <Button type="submit" disabled={busy || !preview || Boolean(validation) || Boolean(message)}>{busy ? "Queueing emails…" : "Send individual emails"}</Button>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
  </form>;
}

function JobReview({ campaignId }: { campaignId: string }) {
  const { client, session } = useIdentity();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<JobStatus[]>([]);
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!client || !session || !open) return;
    setLoading(true); setError("");
    void Promise.resolve(client.rpc("admin_email_job_status", { p_campaign_id: campaignId, p_offset: page * 50 }))
      .then(({ data, error: failure }) => {
        if (active) { if (failure) setError(emailError(failure)); else setRows((data ?? []) as JobStatus[]); }
      }).catch((failure: unknown) => { if (active) setError(emailError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, session, open, campaignId, page, version]);
  return <div>
    <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "Hide recipient status" : "Review recipient status"}</Button>
    {open ? <div>
      <p>Admin-only recipient details. Check uncertain messages in the club Sent folder before choosing a retry.</p>
      <Button type="button" variant="outline" disabled={loading} onClick={() => setVersion((v) => v + 1)}>Refresh recipient status</Button>
      {loading ? <p role="status">Loading recipient status…</p> : error ? <p role="alert">{error}</p> : !rows.length ? <p>No recipients on this page.</p> : <ul>{rows.map((job) => <li key={job.id}>
        <p><strong>{job.full_name}</strong> · {job.recipient}<br />{job.status === "accepted" ? "Accepted by Gmail" : job.status} · {job.attempts} attempts{job.last_error ? ` · ${job.last_error}` : ""}{job.status === "retry" ? ` · Retry after ${new Date(job.next_attempt_at).toLocaleString()}` : ""}</p>
      </li>)}</ul>}
      <div className="workflow-actions"><Button type="button" variant="outline" disabled={loading || page === 0} onClick={() => setPage((v) => v - 1)}>Previous recipients</Button><span>Recipient page {page + 1}</span><Button type="button" variant="outline" disabled={loading || rows.length < 50} onClick={() => setPage((v) => v + 1)}>More recipients</Button></div>
    </div> : null}
  </div>;
}

function RetryCampaign({ campaign, onRetry }: { campaign: Campaign; onRetry: () => void }) {
  const { client } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [includeUnknown, setIncludeUnknown] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function retry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client || busy) return;
    const reason = String(new FormData(e.currentTarget).get("reason") || "").trim();
    setBusy(true); setError(""); setMessage("");
    try {
      const { data, error: failure } = await client.rpc("admin_retry_email_campaign", { p_campaign_id: campaign.id, p_reason: reason, p_include_unknown: includeUnknown });
      if (failure) throw failure;
      setMessage(`${data} emails queued for retry.`); onRetry();
    } catch (failure) { setError(emailError(failure)); }
    finally { setBusy(false); }
  }
  return <form className="workflow-form" onSubmit={(e) => void retry(e)}>
    <label>Retry reason<input name="reason" minLength={3} maxLength={500} required disabled={busy} /></label>
    {campaign.unknown > 0 ? <label><input type="checkbox" checked={includeUnknown} disabled={busy} onChange={(e) => setIncludeUnknown(e.target.checked)} />Include uncertain sends. I checked the club Sent folder and understand these may create duplicate emails.</label> : null}
    <Button type="submit" variant="outline" disabled={busy || (!campaign.failed && !includeUnknown)}>{busy ? "Retrying…" : "Retry reviewed emails"}</Button>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
  </form>;
}

export function EmailDelivery({ notices }: { notices: Notice[] }) {
  const { client, session } = useIdentity();
  const [selected, setSelected] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const noticeIds = notices.map((n) => n.id).join(",");
  useEffect(() => {
    let active = true;
    if (!client || !session || !noticeIds) return;
    const load = async () => {
      try {
        const { data, error: failure } = await client.rpc("admin_email_progress", { p_announcement_ids: noticeIds.split(",") });
        if (failure) throw failure;
        if (active) { setProgress(data as Progress); setError(""); }
      } catch (failure) { if (active) setError(emailError(failure)); }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [client, session, noticeIds, version]);
  const notice = notices.find((n) => n.id === selected);
  return <section className="workflow-panel email-delivery" aria-label="Email delivery">
    <div className="workflow-heading"><h2>Personalized email</h2><Button variant="outline" onClick={() => setVersion((v) => v + 1)}>Refresh email progress</Button></div>
    <p>Publish a dashboard notice first, then send an individual email to its audience. No app daily sending cap is applied. Gmail limits still apply, and its quota errors pause the queue. The worker must be configured and running.</p>
    {!notices.length ? <p>Publish an announcement to compose its email.</p> : <div className="workflow-form"><label>Announcement to email<select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Choose a published announcement</option>{notices.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label></div>}
    {notice ? <EmailComposer key={notice.id} notice={notice} onQueued={() => setVersion((v) => v + 1)} /> : null}
    {error ? <p role="alert">Email progress unavailable: {error}. Dashboard notices remain saved.</p> : notices.length && !progress ? <p role="status">Loading email progress…</p> : null}
    {progress && notices.length ? <>
      <p>{progress.worker.last_seen_at ? `Worker last checked ${new Date(progress.worker.last_seen_at).toLocaleString()}.` : "The worker has not checked this queue yet. Emails will wait until it runs."}</p>
      {progress.worker.last_error ? <p role="status">{progress.worker.last_error === "GMAIL_QUOTA_PAUSED" ? "Gmail sending quota reached." : "Gmail authentication needs attention."} Sending paused until {new Date(progress.worker.next_batch_at).toLocaleString()}.</p> : null}
      {!progress.campaigns.length ? <p>No emails queued for announcements on this page.</p> : progress.campaigns.map((c) => <article key={c.id} className="workflow-panel">
        <h3>{notices.find((n) => n.id === c.announcement_id)?.title || "Announcement"}</h3>
        <p>{c.accepted} of {c.total} accepted by Gmail · {c.queued} queued · {c.failed} failed · {c.unknown} uncertain · {c.cancelled} skipped</p>
        <p>Accepted by Gmail does not prove inbox delivery. One campaign per announcement prevents accidental repeat sends.</p>
        <JobReview campaignId={c.id} />
        {c.failed || c.unknown ? <RetryCampaign campaign={c} onRetry={() => setVersion((v) => v + 1)} /> : null}
      </article>)}
    </> : null}
  </section>;
}
