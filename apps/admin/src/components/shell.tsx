"use client";

import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, CircleHelp, LockKeyhole, Orbit, ScanLine, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import type { ReactNode } from "react";
import { Button, cn } from "@launchpad/ui";
import { IdentityProvider } from "@launchpad/supabase";


import { browserConfig } from "../lib/config";

function NavLink({ href, className, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  return <Link href={href} aria-current={active ? "page" : undefined} className={cn(className, active && "nav-link-active")} {...props} />;
}

function Brand() {
  return <Link href="/" className="brand" aria-label="Launchpad Control overview"><span className="brand-mark"><Orbit size={18} /></span><span>launchpad<span className="brand-dot">.</span><small>CONTROL</small></span></Link>;
}

function SetupNotice() {
  return <div className={cn("setup-notice", browserConfig.ok ? "setup-notice-ready" : "")} role="status"><span className="notice-indicator" /><span>{browserConfig.ok ? "Browser configuration is ready" : "Setup needed to connect Control"}</span><Link href="/setup" className="notice-link">View setup <ArrowRight size={14} /></Link></div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return <IdentityProvider config={browserConfig.ok ? browserConfig.config : null}><div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><Brand /><nav className="main-nav" aria-label="Main navigation"><NavLink href="/" aria-label="Overview" className="nav-link"><Activity size={16} />Overview</NavLink><NavLink href="/events" aria-label="Events" className="nav-link"><CalendarDays size={16} />Events</NavLink><NavLink href="/admins" aria-label="Admins" className="nav-link"><LockKeyhole size={16} />Admins</NavLink><NavLink href="/announcements" aria-label="Announcements" className="nav-link"><Bell size={16} />Announcements</NavLink><NavLink href="/account" aria-label="Account" className="nav-link"><LockKeyhole size={16} />Account</NavLink><NavLink href="/setup" aria-label="Setup" className="nav-link"><Settings2 size={16} />Setup</NavLink></nav><div className="topbar-meta"><span className="role-chip"><span />Admin space</span><span className="avatar-placeholder" aria-label="Admin app">A</span></div></div></header>
    <main className="page-wrap">{children}</main>
    <footer className="site-footer"><span>TechSpace | Launchpad Control</span><span>Event operations, made clear.</span></footer>
  </div></IdentityProvider>;
}

export function OverviewPage() {
  return <>
    <SetupNotice />
    <section className="welcome-row"><div><span className="eyebrow"><Orbit size={14} /> CONTROL ROOM</span><h1>Good work starts<br /><span>with a clear view.</span></h1><p>One calm place to organize the TechSpace events your community shows up for.</p></div><div className="welcome-orbit" aria-hidden="true"><span className="orbit-core"><Orbit size={25} /></span><i /><b /></div></section>
    <section className="status-panel" aria-label="Dashboard connection status"><div className="status-panel-heading"><div><span className="eyebrow muted-eyebrow">WORKSPACE STATUS</span><h2>Manage your events.</h2></div><span className="not-live-pill"><span />EVENT WORKFLOWS</span></div><p>Authorized admins can now create events, publish registration windows, and review participant records. Attendance and announcements are later workflows.</p><div className="status-empty"><span className="empty-glyph"><Activity size={21} /></span><strong>Open event management</strong><span>Sign in with an authorized account to see real events and registrations.</span></div><Button asChild><Link href="/events">Manage events <ArrowRight size={16} /></Link></Button></section>
    <section className="content-section" aria-labelledby="tools-heading"><div className="section-heading"><div><span className="eyebrow muted-eyebrow">OPERATIONS</span><h2 id="tools-heading">Tools for the work ahead.</h2></div><span className="section-side-note">Planned admin workflows will connect here as they’re built.</span></div>
      <div className="tool-grid">
        <article className="tool-card"><span className="tool-icon violet"><CalendarDays size={18} /></span><span className="tool-status">PLANNED</span><h3>Events & registrations</h3><p>Create an event, manage details, and review its participant list.</p><span className="tool-foot">EVENT OPERATIONS <ArrowUpRight size={14} /></span></article>
        <article className="tool-card"><span className="tool-icon cyan"><ScanLine size={18} /></span><span className="tool-status">PLANNED</span><h3>Attendance</h3><p>Check in registered attendees with event specific QR credentials.</p><span className="tool-foot">CHECK-IN <ArrowUpRight size={14} /></span></article>
        <article className="tool-card"><span className="tool-icon mint"><Bell size={18} /></span><span className="tool-status">PLANNED</span><h3>Announcements</h3><p>Share event updates and resources with the right audience.</p><span className="tool-foot">COMMUNITY UPDATES <ArrowUpRight size={14} /></span></article>
      </div>
    </section>
    <div className="security-note"><LockKeyhole size={16} /><span>Admin access requires a protected server-side role. Open Events to create and publish events using an authorized account.</span><Link href="/setup" aria-label="Open setup"><ArrowRight size={16} /></Link></div>
  </>;
}

export function SetupPage() {
  return <section className="setup-page"><Link href="/" className="back-link"><ArrowLeft size={14} /> Back to overview</Link><div className="setup-heading"><span className="setup-icon"><Settings2 size={22} /></span><span className="eyebrow muted-eyebrow">LOCAL CONFIGURATION</span><h1>Set up the<br /><span>control room.</span></h1><p>Provide the public browser settings for Project 1 when available. Event workflows use authenticated access to this project.</p></div>
    <div className="config-card"><div className="config-card-head"><span className={cn("config-led", browserConfig.ok && "config-led-ready")} /><div><strong>{browserConfig.ok ? "Browser settings found" : "Browser settings missing"}</strong><span>{browserConfig.ok ? "The required public values are present." : browserConfig.error}</span></div><span className="config-badge">{browserConfig.ok ? "READY" : "ACTION NEEDED"}</span></div><div className="setup-steps"><div className="setup-step"><span>01</span><p>Copy <code>.env.example</code> to <code>.env.local</code> in <code>apps/admin</code>.</p></div><div className="setup-step"><span>02</span><p>Set <code>NEXT_PUBLIC_MAIN_SUPABASE_URL</code> and <code>NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY</code> to the Project 1 public values.</p></div><div className="setup-step"><span>03</span><p>Restart the dev server. Browser keys are public; service-role and other secrets stay server-side.</p></div></div><div className="config-foot"><CircleHelp size={16} /><span>Admin authority is checked by the backend. Google sign-in requires provider setup; development supports test accounts.</span></div></div>
  </section>;
}

export function NotFoundPage() {
  return <section className="not-found"><span className="eyebrow muted-eyebrow">UNMAPPED ROUTE</span><strong>404</strong><h1>This view is<br />still on the drawing board.</h1><p>That route isn’t part of the current Control preview.</p><Button asChild variant="outline"><Link href="/">Return to overview <ArrowRight size={16} /></Link></Button></section>;
}
