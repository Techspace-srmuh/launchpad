"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

interface AdminAccessRecord {
  email: string;
  active: boolean;
  user_id: string | null;
  updated_at: string;
}

function accessError(failure: unknown): string {
  const message = workflowError(failure);
  if (message.includes("ACCOUNT_NOT_FOUND")) return "This email needs a confirmed account. Ask the person to sign in first, then try again.";
  if (message.includes("INVALID_ADMIN_EMAIL")) return "Enter a valid email address.";
  if (message.includes("INVALID_ADMIN_REASON")) return "Enter a reason between 3 and 500 characters.";
  if (message.includes("SELF_REVOKE_NOT_ALLOWED")) return "You cannot revoke your own admin access. Another admin must make that change.";
  return message;
}

export function AdminAccessPage() {
  const { client } = useIdentity();
  const [records, setRecords] = useState<AdminAccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  const [email, setEmail] = useState("");
  const [action, setAction] = useState("grant");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let active = true;
    if (!client) return;
    setLoading(true);
    setLoadError("");
    void (async () => {
      const { data, error } = await client.rpc("admin_list_access", { p_offset: page * 100 });
      if (error) throw error;
      if (active) setRecords((data ?? []) as AdminAccessRecord[]);
    })().catch((failure: unknown) => {
      if (active) { setRecords([]); setLoadError(accessError(failure)); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, page, version]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setBusy(true);
    setSaveError("");
    setMessage("");
    try {
      const { error } = await client.rpc("admin_set_access", {
        p_email: email.trim().toLowerCase(),
        p_active: action === "grant",
        p_reason: reason.trim(),
      });
      if (error) throw error;
      setMessage(action === "grant" ? "Admin access granted." : "Admin access revoked.");
      setReason("");
      setPage(0);
      setVersion((value) => value + 1);
    } catch (failure) {
      setSaveError(accessError(failure));
    } finally {
      setBusy(false);
    }
  }

  return <section className="workflow-section">
    <div className="workflow-heading"><h1>Admin access</h1><Button variant="outline" disabled={loading || busy} onClick={() => setVersion((value) => value + 1)}>Refresh admin access</Button></div>
    <div className="workflow-panel">
      <h2>Grant or revoke access</h2>
      <p>Admins can manage events, view participant records and manage other admins. Grant access only to people trusted to run the club.</p>
      <p>Use the exact email of a person who has already signed in. Every change records who made it and the reason.</p>
      <form className="workflow-form" onSubmit={(event) => void save(event)}>
        <label>Account email<input type="email" autoComplete="off" required disabled={busy} maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setMessage(""); }} /></label>
        <label>Action<select aria-label="Action" value={action} disabled={busy} onChange={(event) => { setAction(event.target.value); setMessage(""); }}><option value="grant">Grant admin access</option><option value="revoke">Revoke admin access</option></select></label>
        <label>Reason<textarea required disabled={busy} minLength={3} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save admin access"}</Button>
      </form>
      {message && <p role="status">{message}</p>}
      {saveError && <p role="alert">{saveError}</p>}
    </div>
    <div className="workflow-panel">
      <h2>Authorized accounts</h2>
      {loading ? <p role="status">Loading admin access…</p> : loadError ? <><p role="alert">{loadError}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>Retry loading admin access</Button></> : !records.length ? <p>No authorized accounts on this page.</p> : <div className="table-scroll"><table><thead><tr><th scope="col">Email</th><th scope="col">Access</th><th scope="col">Account</th><th scope="col">Updated</th></tr></thead><tbody>{records.map((record) => <tr key={record.email}><td>{record.email}</td><td>{record.active ? "Active" : "Revoked"}</td><td>{record.user_id ? "Linked" : "Awaiting first sign-in"}</td><td>{new Date(record.updated_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
      {!loading && !loadError && (page > 0 || records.length >= 100) && <div className="workflow-actions"><Button variant="outline" disabled={page === 0 || busy} onClick={() => setPage((value) => value - 1)}>Previous page</Button><span>Page {page + 1}</span><Button variant="outline" disabled={records.length < 100 || busy} onClick={() => setPage((value) => value + 1)}>Next page</Button></div>}
    </div>
  </section>;
}
