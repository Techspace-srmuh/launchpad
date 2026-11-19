import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, CircleHelp, LockKeyhole, Orbit, ScanLine, Settings2 } from "lucide-react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { Button, cn } from "@launchpad/ui";
import { readBrowserConfig } from "@launchpad/supabase";

const browserConfig = readBrowserConfig(import.meta.env);

function Brand() {
  return <Link to="/" className="brand" aria-label="Launchpad Control overview"><span className="brand-mark"><Orbit size={18} /></span><span>launchpad<span className="brand-dot">.</span><small>CONTROL</small></span></Link>;
}

function SetupNotice() {
  return <div className={cn("setup-notice", browserConfig.ok ? "setup-notice-ready" : "")} role="status"><span className="notice-indicator" /><span>{browserConfig.ok ? "Browser configuration is ready" : "Setup needed to connect Control"}</span><Link to="/setup" className="notice-link">View setup <ArrowRight size={14} /></Link></div>;
}

function Layout({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><Brand /><nav className="main-nav" aria-label="Main navigation"><NavLink to="/" end aria-label="Overview" className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}><Activity size={16} />Overview</NavLink><NavLink to="/setup" aria-label="Setup" className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}><Settings2 size={16} />Setup</NavLink></nav><div className="topbar-meta"><span className="role-chip"><span />Admin space</span><span className="avatar-placeholder" aria-label="No account signed in">A</span></div></div></header>
    <main className="page-wrap">{children}</main>
    <footer className="site-footer"><span>TechSpace | Launchpad Control</span><span>Event operations, made clear.</span></footer>
  </div>;
}

function OverviewPage() {
  return <>
    <SetupNotice />
    <section className="welcome-row"><div><span className="eyebrow"><Orbit size={14} /> CONTROL ROOM</span><h1>Good work starts<br /><span>with a clear view.</span></h1><p>One calm place to organize the TechSpace events your community shows up for.</p></div><div className="welcome-orbit" aria-hidden="true"><span className="orbit-core"><Orbit size={25} /></span><i /><b /></div></section>
    <section className="status-panel" aria-label="Dashboard connection status"><div className="status-panel-heading"><div><span className="eyebrow muted-eyebrow">WORKSPACE STATUS</span><h2>Your control room is taking shape.</h2></div><span className="not-live-pill"><span />NOT CONNECTED</span></div><p>Events, registrations, and attendance will appear here after the shared Project 1 connection and admin access are implemented.</p><div className="status-empty"><span className="empty-glyph"><Activity size={21} /></span><strong>No workspace data is connected</strong><span>There are no event records or metrics to show in this preview.</span></div></section>
    <section className="content-section" aria-labelledby="tools-heading"><div className="section-heading"><div><span className="eyebrow muted-eyebrow">OPERATIONS</span><h2 id="tools-heading">Tools for the work ahead.</h2></div><span className="section-side-note">Planned admin workflows will connect here as they’re built.</span></div>
      <div className="tool-grid">
        <article className="tool-card"><span className="tool-icon violet"><CalendarDays size={18} /></span><span className="tool-status">PLANNED</span><h3>Events & registrations</h3><p>Create an event, manage details, and review its participant list.</p><span className="tool-foot">EVENT OPERATIONS <ArrowUpRight size={14} /></span></article>
        <article className="tool-card"><span className="tool-icon cyan"><ScanLine size={18} /></span><span className="tool-status">PLANNED</span><h3>Attendance</h3><p>Check in registered attendees with event specific QR credentials.</p><span className="tool-foot">CHECK-IN <ArrowUpRight size={14} /></span></article>
        <article className="tool-card"><span className="tool-icon mint"><Bell size={18} /></span><span className="tool-status">PLANNED</span><h3>Announcements</h3><p>Share event updates and resources with the right audience.</p><span className="tool-foot">COMMUNITY UPDATES <ArrowUpRight size={14} /></span></article>
      </div>
    </section>
    <div className="security-note"><LockKeyhole size={16} /><span>Admin access will be granted by a protected server-side role. This shell has no authentication or privileged actions.</span><Link to="/setup" aria-label="Open setup"><ArrowRight size={16} /></Link></div>
  </>;
}

function SetupPage() {
  return <section className="setup-page"><Link to="/" className="back-link"><ArrowLeft size={14} /> Back to overview</Link><div className="setup-heading"><span className="setup-icon"><Settings2 size={22} /></span><span className="eyebrow muted-eyebrow">LOCAL CONFIGURATION</span><h1>Set up the<br /><span>control room.</span></h1><p>Provide the public browser settings for Project 1 when available. This preview does not authenticate or contact the backend.</p></div>
    <div className="config-card"><div className="config-card-head"><span className={cn("config-led", browserConfig.ok && "config-led-ready")} /><div><strong>{browserConfig.ok ? "Browser settings found" : "Browser settings missing"}</strong><span>{browserConfig.ok ? "The required public values are present." : browserConfig.error}</span></div><span className="config-badge">{browserConfig.ok ? "READY" : "ACTION NEEDED"}</span></div><div className="setup-steps"><div className="setup-step"><span>01</span><p>Copy <code>.env.example</code> to <code>.env.local</code> in <code>apps/admin</code>.</p></div><div className="setup-step"><span>02</span><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to the Project 1 public values.</p></div><div className="setup-step"><span>03</span><p>Restart the dev server. Browser keys are public; service-role and other secrets stay server-side.</p></div></div><div className="config-foot"><CircleHelp size={16} /><span>Admin sign-in and role checks are deferred to the identity phase.</span></div></div>
  </section>;
}

function NotFoundPage() {
  return <section className="not-found"><span className="eyebrow muted-eyebrow">UNMAPPED ROUTE</span><strong>404</strong><h1>This view is<br />still on the drawing board.</h1><p>That route isn’t part of the current Control preview.</p><Button asChild variant="outline"><Link to="/">Return to overview <ArrowRight size={16} /></Link></Button></section>;
}

export default function App() {
  return <Layout><Routes><Route path="/" element={<OverviewPage />} /><Route path="/setup" element={<SetupPage />} /><Route path="*" element={<NotFoundPage />} /></Routes></Layout>;
}
