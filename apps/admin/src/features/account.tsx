"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { isProfileComplete, useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import { browserConfig } from "../lib/config";

export function AccessGate({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const identity = useIdentity();
  if (identity.loading) return <p role="status">Checking your account…</p>;
  if (!identity.client) return <section className="workflow-panel"><h1>Setup needed</h1><p>Configure the MAIN Supabase project to use this workflow.</p><Link href="/setup">View setup</Link></section>;
  if (!identity.session) return <section className="workflow-panel"><h1>Sign in required</h1><p>An authenticated account is required to access event records.</p><Link href="/account">Open account</Link></section>;
  if (identity.error) return <section className="workflow-panel"><h1>Account access could not be checked</h1><p role="alert">{identity.error}</p><Button onClick={() => void identity.refresh()}>Retry</Button><Link href="/account">Open account</Link></section>;
  if (admin && !identity.isAdmin) return <section className="workflow-panel"><h1>Admin access required</h1><p>This account is not authorized for admin operations.</p><Link href="/account">Open account</Link></section>;
  return children;
}

export function AccountPage() {
  const { client, session, profile, isAdmin, loading, error: identityError } = useIdentity();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const fragment = new URLSearchParams(currentUrl.hash.slice(1));
    const code = fragment.get("error") ?? currentUrl.searchParams.get("error");
    if (!code) return;
    // Provider descriptions may contain untrusted or sensitive values. Display
    // our own messages and remove callback errors from the address bar.
    setError(code === "access_denied" ? "Google sign-in was cancelled. You can try again." : "Google sign-in could not be completed. Please try again.");
    if (fragment.has("error")) currentUrl.hash = "";
    for (const key of ["error", "error_code", "error_description"]) currentUrl.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
  }, []);
  async function signInWithGoogle() {
    if (!client) return;
    setBusy(true); setError("");
    try {
      if (!browserConfig.ok) return;
      const settingsResponse = await fetch(`${browserConfig.config.url}/auth/v1/settings`, {
        headers: { apikey: browserConfig.config.publishableKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (!settingsResponse.ok) throw new Error("AUTH_SETTINGS_UNAVAILABLE");
      const settings: { external?: { google?: boolean } } = await settingsResponse.json();
      if (settings.external?.google !== true) {
        setError("Google sign-in is not configured yet. Please contact TechSpace.");
        return;
      }
      const result = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/account` },
      });
      if (result.error) throw result.error;
    } catch {
      setError("Google sign-in could not start. Please try again or contact TechSpace if it is not configured yet.");
    } finally { setBusy(false); }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client || !(process.env.NODE_ENV === "development")) return;
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
  return <section className="account-layout workflow-section"><div className="account-intro"><span className="eyebrow"><ShieldCheck size={15} /> CONTROL ROOM ACCESS</span><h1>Your admin space.</h1><p>Sign in to manage TechSpace events and the people who attend them.</p><span className="account-intro-art" aria-hidden="true"><ShieldCheck size={94} strokeWidth={1.2} /></span></div><div className="workflow-panel account-card"><span className="account-card-icon"><UserRound size={22} /></span><h2>Account</h2>
    {!client ? <p>MAIN Supabase settings are missing. <Link href="/setup">View setup</Link>.</p> : loading ? <p role="status">Checking your account…</p> : session ? <>
      <p>Signed in as <strong>{session.user.email}</strong></p>
      {!isProfileComplete(profile) && <p>Complete your student details to register for events. No manual approval is required.</p>}
      <div className="workflow-actions">
        {!isProfileComplete(profile) ? <Button asChild><Link href="/profile">Complete student profile</Link></Button> : <Link href="/profile">Edit student profile</Link>}
        <Link href="/events">Open events <ArrowRight size={15} /></Link>
        {isAdmin && <Link href="/admins">Manage admin access</Link>}
        <Button disabled={busy} variant="outline" onClick={() => void signOut()}>Sign out</Button>
      </div>
    </> : <>
      <p>Use your personal Gmail or university Google account. University addresses use <span>registration_number@stu.srmuviversity.ac.in</span>.</p>
      <Button disabled={busy} onClick={() => void signInWithGoogle()}>{busy ? "Connecting…" : "Continue with Google"}</Button>
      {(process.env.NODE_ENV === "development") && <form onSubmit={(event) => void signIn(event)} className="workflow-form"><p>Development access uses real test accounts provisioned in Supabase. It does not grant admin permission.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><Button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</Button></form>}
    </>}
    {(error || identityError) && <p role="alert">{error || identityError}</p>}
  </div></section>;
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
      const result = await client.rpc("save_profile", { p_full_name: String(values.get("full_name")), p_roll_number: String(values.get("roll_number")), p_department: String(values.get("department")), p_academic_year: Number(values.get("academic_year")), p_course: String(values.get("course")), p_branch: String(values.get("branch")), p_section: String(values.get("section")), p_mobile_number: String(values.get("mobile_number")) });
      if (result.error) throw result.error;
      setMessage("Profile saved."); await refresh();
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  return <section className="workflow-section admin-profile-page"><div className="profile-intro"><span className="eyebrow"><UserRound size={15} /> ACCOUNT DETAILS</span><h1>Profile details</h1><p>Keep your personal details up to date. These details are self-declared.</p></div><div className="workflow-panel profile-form-card"><h2>Student registration details</h2>
    <p>Complete your details once to register for events immediately. No manual university approval is required. These are self-declared details.</p>
    <form key={profile?.user_id ?? "new"} onSubmit={(event) => void save(event)} className="workflow-form">
      <label>Full name<input name="full_name" autoComplete="name" required maxLength={120} defaultValue={profile?.full_name ?? ""} /></label>
      <label>Registration number<input name="roll_number" required maxLength={40} readOnly={Boolean(profile?.roll_number)} defaultValue={profile?.roll_number ?? ""} /></label>
      {profile?.roll_number && <p>Your claimed registration number cannot be changed here.</p>}
      <label>Course<input name="course" required maxLength={120} placeholder="For example, B.Tech" defaultValue={profile?.course ?? ""} /></label>
      <label>Branch<input name="branch" required maxLength={120} placeholder="For example, Computer Science" defaultValue={profile?.branch ?? ""} /></label>
      <label>Department<input name="department" required maxLength={120} defaultValue={profile?.department ?? ""} /></label>
      <label>Section<input name="section" required maxLength={40} defaultValue={profile?.section ?? ""} /></label>
      <label>Current year of study<select name="academic_year" required defaultValue={profile?.academic_year ?? ""}><option value="" disabled>Select your current year</option>{Array.from({ length: 8 }, (_, index) => { const year = index + 1; const suffix = year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"; return <option key={year} value={year}>{year}{suffix} year</option>; })}</select></label>
      <label>Mobile number<input name="mobile_number" type="tel" autoComplete="tel" required maxLength={30} aria-describedby="mobile-help" defaultValue={profile?.mobile_number ?? ""} /></label><p id="mobile-help">Use 10–15 digits, with an optional country code such as +91.</p>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
    </form>
    {error && <p role="alert">{error}</p>}{message && <><p role="status">{message}</p><Link href="/events">Explore events</Link></>}
  </div></section>;
}
