"use client";

import "../onboarding-theme.css";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarCheck2, BookOpen, PencilLine, UserRound } from "lucide-react";
import { isProfileComplete, useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";
import { browserConfig } from "../lib/config";
import { AstronautDoodle } from "../components/space-doodles";

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
  const { client, session, profile, loading, error: identityError } = useIdentity();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const fragment = new URLSearchParams(currentUrl.hash.slice(1));
    const code = fragment.get("error") ?? currentUrl.searchParams.get("error");
    if (!code) return;
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
      const settingsResponse = await fetch(`${browserConfig.config.url}/auth/v1/settings`, { headers: { apikey: browserConfig.config.publishableKey }, signal: AbortSignal.timeout(10_000) });
      if (!settingsResponse.ok) throw new Error("AUTH_SETTINGS_UNAVAILABLE");
      const settings: { external?: { google?: boolean } } = await settingsResponse.json();
      if (settings.external?.google !== true) { setError("Google sign-in is not configured yet. Please contact TechSpace."); return; }
      const result = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/account` } });
      if (result.error) throw result.error;
    } catch { setError("Google sign-in could not start. Please try again or contact TechSpace if it is not configured yet."); }
    finally { setBusy(false); }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!client || process.env.NODE_ENV !== "development") return;
    setBusy(true); setError("");
    try { const result = await client.auth.signInWithPassword({ email: email.trim(), password }); if (result.error) throw result.error; setPassword(""); }
    catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  async function signOut() {
    if (!client) return;
    setBusy(true); setError("");
    try { const result = await client.auth.signOut(); if (result.error) throw result.error; }
    catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  return <section className="workflow-panel account-page"><div className="account-illustration"><AstronautDoodle scene="flag" /></div><span className="eyebrow">YOUR LAUNCHPAD</span><h1>One sign in.<br />Every event.</h1>
    {!client ? <p>MAIN Supabase settings are missing. <Link href="/setup">View setup</Link>.</p> : loading ? <p role="status">Checking your account…</p> : session ? <>
      <p>Signed in as <strong>{session.user.email}</strong></p>
      {!isProfileComplete(profile) && <p>Complete your student details to register for events. No manual approval is required.</p>}
      <div className="workflow-actions">
        {!isProfileComplete(profile) ? <Button asChild><Link href="/profile">Complete student profile</Link></Button> : <Link href="/profile">View student profile</Link>}
        <Link href="/events">Open events</Link>
        <Button disabled={busy} variant="outline" onClick={() => void signOut()}>Sign out</Button>
      </div>
    </> : <>
      <p>Discover events, keep your QR close, and catch every club update. Sign in with a personal Gmail or university Google account.</p>
      <Button className="account-google-button" disabled={busy} onClick={() => void signInWithGoogle()}>{busy ? "Connecting…" : "Continue with Google"}</Button>
      <p className="account-footnote">University accounts use registration_number@stu.srmuviversity.ac.in. Personal Gmail works too.</p>
      <Link className="onboarding-optional-link" href="/welcome">See how Launchpad works <ArrowRight size={16} aria-hidden="true" /></Link>
      {process.env.NODE_ENV === "development" && <form onSubmit={(event) => void signIn(event)} className="workflow-form"><p>Development access uses real test accounts provisioned in Supabase. It does not grant admin permission.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><Button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</Button></form>}
    </>}
    {(error || identityError) && <p role="alert">{error || identityError}</p>}
  </section>;
}

type ProfileValues = { full_name: string; roll_number: string; course: string; branch: string; department: string; section: string; academic_year: string; mobile_number: string };

function initialValues(profile: ReturnType<typeof useIdentity>["profile"]): ProfileValues {
  return { full_name: profile?.full_name ?? "", roll_number: profile?.roll_number ?? "", course: profile?.course ?? "", branch: profile?.branch ?? "", department: profile?.department ?? "", section: profile?.section ?? "", academic_year: String(profile?.academic_year ?? ""), mobile_number: profile?.mobile_number ?? "" };
}

function ProfileEditor({ profile, onCancel, onSaved }: { profile: NonNullable<ReturnType<typeof useIdentity>["profile"]> | null; onCancel?: () => void; onSaved?: () => void }) {
  const { client, refresh } = useIdentity();
  const [values, setValues] = useState<ProfileValues>(() => initialValues(profile));
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function update(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) { const { name, value } = event.currentTarget; setValues((previous) => ({ ...previous, [name]: value })); }
  function continueToStudies(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setError(""); setStep(2);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await client.rpc("save_profile", { p_full_name: values.full_name, p_roll_number: values.roll_number, p_department: values.department, p_academic_year: Number(values.academic_year), p_course: values.course, p_branch: values.branch, p_section: values.section, p_mobile_number: values.mobile_number });
      if (result.error) throw result.error;
      setMessage("Profile saved."); await refresh(); onSaved?.();
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  const input = (name: keyof ProfileValues, label: string, options: { autoComplete?: string; type?: string; min?: string; max?: string; maxLength?: number; placeholder?: string; readOnly?: boolean; help?: string } = {}) => <label key={name}>{label}<input name={name} value={values[name]} onChange={update} autoComplete={options.autoComplete} type={options.type ?? "text"} min={options.min} max={options.max} maxLength={options.maxLength} placeholder={options.placeholder} readOnly={options.readOnly} required aria-describedby={options.help ? `${name}-help` : undefined} />{options.help && <span id={`${name}-help`} className="field-help">{options.help}</span>}</label>;

  return <section className="profile-page"><header className="profile-intro"><AstronautDoodle scene="idea" className="profile-astronaut" /><span className="eyebrow">YOUR DETAILS · STEP {step} OF 2</span><h1>{profile ? "Edit your" : "Let’s set up"}<br />{profile ? "profile." : "space."}</h1><p>A few details connect your event registrations and check-ins. Complete details make you eligible to register immediately.</p></header>
    {step === 1 ? <form onSubmit={(event) => continueToStudies(event)} className="workflow-form profile-form">
      <section className="profile-form-section" aria-labelledby="identity-heading"><div className="profile-section-heading"><span>01</span><div><h2 id="identity-heading">Your identity</h2><p>How we’ll identify your event record.</p></div></div><div className="profile-fields profile-fields-single">
        {input("full_name", "Full name", { autoComplete: "name", maxLength: 120, placeholder: "Your full name" })}{input("roll_number", "Registration number", { maxLength: 40, placeholder: "Your registration number", readOnly: Boolean(profile?.roll_number), help: profile?.roll_number ? "Your claimed registration number cannot be changed here." : undefined })}
      </div></section>
      <div className="profile-submit"><p>Use the name and registration number you use for your studies. Your profile details are self-declared.</p><Button type="submit">Continue <ArrowRight aria-hidden="true" /></Button></div>
    </form> : <form onSubmit={(event) => void save(event)} className="workflow-form profile-form">
      <section className="profile-form-section" aria-labelledby="study-heading"><div className="profile-section-heading"><span>02</span><div><h2 id="study-heading">Study and contact</h2><p>Finish the details needed for event registration.</p></div></div><div className="profile-fields">
        {input("course", "Course", { maxLength: 120, placeholder: "For example, B.Tech" })}{input("branch", "Branch", { maxLength: 120, placeholder: "For example, Computer Science" })}{input("department", "Department", { maxLength: 120, placeholder: "Your department" })}{input("section", "Section", { maxLength: 40, placeholder: "Your section" })}<label>Current year of study<select name="academic_year" value={values.academic_year} onChange={update} required><option value="" disabled>Select your current year</option>{Array.from({ length: 8 }, (_, index) => { const year = index + 1; const suffix = year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"; return <option key={year} value={year}>{year}{suffix} year</option>; })}</select><span className="field-help">Choose the year you are studying now.</span></label>{input("mobile_number", "Mobile number", { type: "tel", autoComplete: "tel", maxLength: 30, placeholder: "+91 98765 43210", help: "Use 10–15 digits, with an optional country code such as +91." })}
      </div></section>
      <div className="profile-submit profile-submit-step"><Button type="button" variant="outline" onClick={() => { setError(""); setStep(1); }}><ArrowLeft aria-hidden="true" /> Back</Button><p>These details are self-declared and do not verify university enrollment. No manual approval is required.</p><Button type="submit" disabled={busy}>{busy ? "Saving…" : profile ? "Save changes" : "Save and explore events"}</Button></div>
    </form>}
    {onCancel && <Button className="profile-cancel" variant="ghost" onClick={onCancel}>Cancel editing</Button>}
    {error && <p role="alert">{error}</p>}{message && <><p role="status">{message}</p><Link href="/events">Explore events</Link></>}
  </section>;
}

export function ProfilePage() {
  const { client, profile, loading } = useIdentity();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading) return <p role="status">Loading your profile…</p>;
  if (!isProfileComplete(profile)) return <ProfileEditor key={profile?.user_id ?? "new"} profile={profile} />;
  if (!profile) return <p role="status">Loading your profile…</p>;
  if (editing) return <ProfileEditor key={`${profile.user_id}-edit`} profile={profile} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />;
  async function signOut() {
    if (!client) return;
    setBusy(true); setError("");
    try { const result = await client.auth.signOut(); if (result.error) throw result.error; }
    catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  return <section className="profile-overview">
    <header className="profile-overview-heading"><div><span className="eyebrow">YOUR LAUNCHPAD PROFILE</span><h1>Good to have you here.</h1><p>Your student details and shortcuts to your Launchpad activity.</p></div><AstronautDoodle scene="flag" className="profile-overview-art" /></header>
    <section className="profile-overview-card" aria-labelledby="student-name"><div className="profile-avatar" aria-hidden="true"><UserRound /></div><div className="profile-overview-identity"><span className="profile-overview-label">STUDENT PROFILE</span><h2 id="student-name">{profile.full_name}</h2><p>{profile.course} · {profile.branch}</p><p>{profile.department}{profile.section ? ` · Section ${profile.section}` : ""} · Current year of study: {profile.academic_year}</p><p className="profile-roll">Registration number <strong>{profile.roll_number}</strong></p></div><Button variant="outline" onClick={() => setEditing(true)}><PencilLine aria-hidden="true" /> Edit profile</Button></section>
    <nav className="profile-overview-links" aria-label="Profile shortcuts"><Link href="/my-events"><CalendarCheck2 aria-hidden="true" /><span><strong>My attendance</strong><small>View your event registrations and check-ins</small></span><ArrowRight aria-hidden="true" /></Link><Link href="/events"><BookOpen aria-hidden="true" /><span><strong>Event resources</strong><small>Open materials shared with event participants</small></span><ArrowRight aria-hidden="true" /></Link></nav>
    <div className="profile-overview-account"><span><strong>Account</strong><small>Signed in with your Google account</small></span><Button variant="outline" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</Button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
