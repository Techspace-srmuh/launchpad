"use client";

import "../onboarding-theme.css";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck2, BookOpen, PencilLine, UserRound, GraduationCap, IdCard, Mail, Network, Phone, ChartNoAxesColumnIncreasing, Building2, UsersRound, ChevronDown, type LucideIcon } from "lucide-react";
import { isProfileComplete, useIdentity, workflowError } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";
import { browserConfig } from "../lib/config";
import { AstronautDoodle } from "../components/space-doodles";
import { LaunchpadBrand, MoonHorizon } from "./onboarding";

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
  const router = useRouter();
  const checkingNewAccount = useRef(false);
  const [showEmail, setShowEmail] = useState(false);
  useEffect(() => {
    if (!session) checkingNewAccount.current = false;
    else if (loading) checkingNewAccount.current = true;
    else if (checkingNewAccount.current) {
      checkingNewAccount.current = false;
      if (!identityError && !isProfileComplete(profile)) router.replace("/profile");
    }
  }, [loading, session, profile, identityError, router]);
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
  return <section className="onboarding-screen sign-in-screen" aria-labelledby="sign-in-title">
    <LaunchpadBrand />
    <div className="sign-in-copy">
      <h1 id="sign-in-title">{session ? "You’re ready to launch" : "Sign in to continue"}</h1>
      <p>{session ? <>Signed in as <strong>{session.user.email}</strong></> : <>Use your Google account to access<br />Launchpad.</>}</p>
    </div>
    {loading ? <p role="status">Checking your account…</p> : session ? <div className="sign-in-options">
      <Link className="onboarding-primary" href={isProfileComplete(profile) ? "/" : "/profile"}>{isProfileComplete(profile) ? "Open Launchpad" : "Complete your profile"}<ArrowRight aria-hidden="true" /></Link>
      <button className="onboarding-secondary" disabled={busy} onClick={() => void signOut()}>Sign out</button>
    </div> : <div className="sign-in-options">
      <button type="button" className="sign-in-provider" disabled={busy || !client} onClick={() => void signInWithGoogle()}>
        <svg viewBox="0 0 48 48" aria-hidden="true" className="google-mark"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
        {busy ? "Connecting…" : "Continue with Google"}
      </button>
      {process.env.NODE_ENV === "development" && <>
        <div className="sign-in-divider"><span />or<span /></div>
        <button type="button" className="sign-in-provider sign-in-email" aria-expanded={showEmail} aria-controls="development-sign-in" onClick={() => setShowEmail((value) => !value)}><Mail aria-hidden="true" /><span>Continue with Email<small>(Development only)</small></span></button>
        {showEmail && <form id="development-sign-in" onSubmit={(event) => void signIn(event)} className="sign-in-form">
          <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="onboarding-primary" disabled={busy || !client} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        </form>}
      </>}
      {!client && <p className="onboarding-notice" role="status">Sign-in is unavailable until Launchpad is connected. <Link href="/setup">View setup</Link>.</p>}
    </div>}
    {(error || identityError) && <p className="onboarding-error" role="alert">{error || identityError}</p>}
    <MoonHorizon />
  </section>;
}

type ProfileValues = { full_name: string; roll_number: string; course: string; branch: string; department: string; section: string; academic_year: string; mobile_number: string };

function initialValues(profile: ReturnType<typeof useIdentity>["profile"]): ProfileValues {
  return { full_name: profile?.full_name ?? "", roll_number: profile?.roll_number ?? "", course: profile?.course ?? "", branch: profile?.branch ?? "", department: profile?.department ?? "", section: profile?.section ?? "", academic_year: String(profile?.academic_year ?? ""), mobile_number: profile?.mobile_number ?? "" };
}

const courseOptions = ["B.Tech", "B.Sc", "BCA", "BBA", "B.Com", "BA", "M.Tech", "M.Sc", "MCA", "MBA", "PhD"];
const branchOptions = ["Computer Science & Engineering", "Electronics & Communication", "Mechanical Engineering", "Civil Engineering", "Electrical Engineering", "Information Technology"];

function ProfileEditor({ profile, onCancel, onSaved }: { profile: NonNullable<ReturnType<typeof useIdentity>["profile"]> | null; onCancel?: () => void; onSaved?: () => void }) {
  const { client, refresh } = useIdentity();
  const router = useRouter();
  const [values, setValues] = useState<ProfileValues>(() => initialValues(profile));
  const [step, setStep] = useState<1 | 2>(1);
  const [customFields, setCustomFields] = useState<string[]>(() => [
    ...(profile?.course && !courseOptions.includes(profile.course) ? ["course"] : []),
    ...(profile?.branch && !branchOptions.includes(profile.branch) ? ["branch"] : []),
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function update(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.currentTarget;
    if (value === "__other") {
      setCustomFields((previous) => [...previous, name]);
      setValues((previous) => ({ ...previous, [name]: "" }));
    } else setValues((previous) => ({ ...previous, [name]: value }));
  }
  function focusHeading() { requestAnimationFrame(() => document.getElementById("profile-title")?.focus()); }
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setError(""); setStep(2); focusHeading();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setBusy(true); setError("");
    try {
      const result = await client.rpc("save_profile", { p_full_name: values.full_name, p_roll_number: values.roll_number, p_department: values.department, p_academic_year: Number(values.academic_year), p_course: values.course, p_branch: values.branch, p_section: values.section, p_mobile_number: values.mobile_number });
      if (result.error) throw result.error;
      await refresh();
      if (onSaved) onSaved(); else router.push("/");
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }
  const input = (name: keyof ProfileValues, label: string, Icon: LucideIcon, options: { autoComplete?: string; type?: string; maxLength?: number; placeholder?: string; readOnly?: boolean; help?: string; pattern?: string } = {}) => <div key={name}>
    <label className="onboarding-field"><Icon aria-hidden="true" /><span><span className="onboarding-field-label">{label} <b aria-hidden="true">*</b></span><input name={name} value={values[name]} onChange={update} autoComplete={options.autoComplete} type={options.type ?? "text"} maxLength={options.maxLength} placeholder={options.placeholder} readOnly={options.readOnly} pattern={options.pattern} required aria-describedby={options.help ? `${name}-help` : undefined} /></span></label>
    {options.help && <p id={`${name}-help`} className="onboarding-field-help">{options.help}</p>}
  </div>;
  const select = (name: keyof ProfileValues, label: string, Icon: LucideIcon, options: string[]) => customFields.includes(name)
    ? input(name, label, Icon, { maxLength: 120, placeholder: `Enter your ${label.toLowerCase()}` })
    : <label className="onboarding-field" key={name}><Icon aria-hidden="true" /><span><span className="onboarding-field-label">{label} <b aria-hidden="true">*</b></span><select name={name} value={values[name]} onChange={update} required><option value="" disabled>Select your {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}<option value="__other">Other</option></select></span><ChevronDown className="field-chevron" aria-hidden="true" /></label>;

  return <section className="onboarding-screen profile-setup-screen" aria-labelledby="profile-title">
    <header className="profile-step-header">
      {step === 2 ? <button type="button" aria-label="Previous step" onClick={() => { setError(""); setStep(1); focusHeading(); }} disabled={busy}><ArrowLeft aria-hidden="true" /></button> : onCancel ? <button type="button" onClick={onCancel} aria-label="Cancel editing"><ArrowLeft aria-hidden="true" /></button> : <Link href="/account" aria-label="Back to account"><ArrowLeft aria-hidden="true" /></Link>}
      <span>{step} of 2</span>
    </header>
    <div className="profile-step-progress" role="progressbar" aria-label="Profile setup" aria-valuemin={0} aria-valuemax={2} aria-valuenow={step}><span style={{ width: `${step * 50}%` }} /></div>
    <div className="profile-setup-copy"><h1 id="profile-title" tabIndex={-1}>{onCancel ? "Edit your profile" : "Complete your profile"}</h1><p>{step === 1 ? <>Help us personalize your experience<br />and enable event registration.</> : "A few final details, and you’re ready to join your next TechSpace event."}</p></div>
    <form className="profile-setup-form" onSubmit={step === 1 ? next : (event) => void save(event)}>
      <fieldset disabled={busy} className="profile-setup-fields"><legend className="sr-only">{step === 1 ? "Academic details" : "Department and contact details"}</legend>
        {step === 1 ? <>
          {input("full_name", "Full Name", UserRound, { autoComplete: "name", maxLength: 120, placeholder: "Your full name", pattern: ".*\\S.*" })}
          {input("roll_number", "Registration Number", IdCard, { maxLength: 40, placeholder: "Your registration number", readOnly: Boolean(profile?.roll_number), pattern: ".*\\S.*", help: profile?.roll_number ? "Your registration number cannot be changed." : undefined })}
          {select("course", "Course", GraduationCap, courseOptions)}
          {select("branch", "Branch", Network, branchOptions)}
          <label className="onboarding-field"><ChartNoAxesColumnIncreasing aria-hidden="true" /><span><span className="onboarding-field-label">Academic Year <b aria-hidden="true">*</b></span><select name="academic_year" value={values.academic_year} onChange={update} required><option value="" disabled>Select your current year</option>{Array.from({ length: 8 }, (_, index) => { const year = index + 1; return <option key={year} value={year}>{year}{year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"} Year</option>; })}</select></span><ChevronDown className="field-chevron" aria-hidden="true" /></label>
        </> : <>
          {input("department", "Department", Building2, { maxLength: 120, placeholder: "Your department", pattern: ".*\\S.*" })}
          {input("section", "Section", UsersRound, { maxLength: 40, placeholder: "Your section", pattern: ".*\\S.*" })}
          {input("mobile_number", "Mobile Number", Phone, { type: "tel", autoComplete: "tel", maxLength: 30, placeholder: "+91 98765 43210", help: "Use 10–15 digits, with an optional country code." })}
          <p className="onboarding-field-help">Your details are self-declared. Completing your profile enables event registration without manual approval.</p>
        </>}
      </fieldset>
      {error && <p className="onboarding-error" role="alert">{error}</p>}
      <button type="submit" className="onboarding-primary profile-setup-submit" disabled={busy}>{step === 1 ? "Next" : busy ? "Saving…" : onCancel ? "Save changes" : "Save and explore events"}<ArrowRight aria-hidden="true" /></button>
    </form>
  </section>;
}

export function ProfilePage() {
  const { client, profile, loading } = useIdentity();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (justSaved && isProfileComplete(profile)) router.replace("/"); }, [justSaved, profile, router]);
  if (loading) return <p role="status">Loading your profile.</p>;
  if (!isProfileComplete(profile)) return <ProfileEditor key={profile?.user_id ?? "new"} profile={profile} onSaved={() => setJustSaved(true)} />;
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
