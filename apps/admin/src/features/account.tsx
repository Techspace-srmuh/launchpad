import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

export function AccessGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const identity = useIdentity();
  if (identity.loading) return <p role="status">Checking your account…</p>;
  if (!identity.client) return <section className="workflow-panel"><h1>Setup needed</h1><p>Configure the MAIN Supabase project to use this workflow.</p><Link to="/setup">View setup</Link></section>;
  if (!identity.session) return <section className="workflow-panel"><h1>Sign in required</h1><p>An authenticated account is required to access event records.</p><Link to="/account">Open account</Link></section>;
  if (identity.error) return <section className="workflow-panel"><h1>Account access could not be checked</h1><p role="alert">{identity.error}</p><Button onClick={() => void identity.refresh()}>Retry</Button><Link to="/account">Open account</Link></section>;
  if (admin && !identity.isAdmin) return <section className="workflow-panel"><h1>Admin access required</h1><p>This account is not authorized for admin operations.</p><Link to="/account">Open account</Link></section>;
  return children;
}

export function AccountPage() {
  const { client, session, loading, error: identityError } = useIdentity();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client || !import.meta.env.DEV) return;
    setBusy(true); setError("");
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword("");
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  async function signOut() {
    if (!client) return;
    setBusy(true); setError("");
    try { const result = await client.auth.signOut(); if (result.error) throw result.error; }
    catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  return <section className="workflow-panel"><h1>Account</h1>
    {!client ? <p>MAIN Supabase settings are missing. <Link to="/setup">View setup</Link>.</p> : loading ? <p role="status">Checking your account…</p> : session ? <><p>Signed in as <strong>{session.user.email}</strong></p><div className="workflow-actions"><Button disabled={busy} onClick={() => void signOut()}>Sign out</Button><Link to="/events">Open events</Link></div></> : <>
      <p>Google sign-in is not connected yet.</p>
      {import.meta.env.DEV ? <form onSubmit={(event) => void signIn(event)} className="workflow-form"><p>Development access uses real test accounts provisioned in Supabase. It does not grant admin permission or university verification.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><Button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</Button></form> : <p>Sign-in will be available when Google authentication is configured.</p>}
    </>}
    {(error || identityError) && <p role="alert">{error || identityError}</p>}
  </section>;
}

export function ProfilePage() {
  const { client, profile, refresh } = useIdentity();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await client.rpc("save_profile", { p_full_name: String(values.get("full_name")), p_roll_number: String(values.get("roll_number")), p_department: String(values.get("department")), p_academic_year: Number(values.get("academic_year")) });
      if (result.error) throw result.error;
      setMessage("Profile saved."); await refresh();
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  return <section className="workflow-panel"><h1>Student profile</h1><p>University verification: <strong>{profile?.verification_status ?? "unverified"}</strong>. Verification policy is pending; saving your profile does not verify it.</p>
    <form key={profile?.user_id ?? "new"} onSubmit={(event) => void save(event)} className="workflow-form"><label>Full name<input name="full_name" required maxLength={120} defaultValue={profile?.full_name ?? ""} /></label><label>Roll number<input name="roll_number" required maxLength={40} readOnly={Boolean(profile)} defaultValue={profile?.roll_number ?? ""} /></label>{profile && <p>Your claimed roll number cannot be changed here.</p>}<label>Department<input name="department" required maxLength={120} defaultValue={profile?.department ?? ""} /></label><label>Academic year<input name="academic_year" type="number" min="1" max="8" required defaultValue={profile?.academic_year ?? 1} /></label><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button></form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
