"use client";

import { ArrowLeft, ArrowRight, Bell, Bookmark, CalendarDays, CircleHelp, Compass, Orbit, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ComponentProps } from "react";
import type { ReactNode } from "react";
import { Button, cn } from "@launchpad/ui";
import { IdentityProvider, isProfileComplete, useIdentity } from "@launchpad/supabase";

import { browserConfig } from "../lib/config";
import { StudentDashboard } from "../features/dashboard";
import { OnboardingPage } from "../features/onboarding";
import { AstronautDoodle } from "./space-doodles";

function NavLink({ href, className, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  return <Link href={href} aria-current={active ? "page" : undefined} className={cn(className, active && "nav-link-active")} {...props} />;
}

function Brand() {
  return <Link href="/" className="brand" aria-label="TechSpace Launchpad home"><span className="brand-mark"><AstronautDoodle scene="planet" className="brand-planet" /></span><span className="brand-words"><strong>TechSpace</strong><span>Launchpad</span></span></Link>;
}

function SetupNotice() {
  return (
    <div className={cn("setup-notice", browserConfig.ok ? "setup-notice-ready" : "")} role="status">
      <span className="notice-indicator" />
      <span>{browserConfig.ok ? "Browser configuration is ready" : "Setup needed to connect Launchpad"}</span>
      <Link href="/setup" className="notice-link">View setup <ArrowRight size={14} /></Link>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <IdentityProvider config={browserConfig.ok ? browserConfig.config : null}><StudentShell>{children}</StudentShell></IdentityProvider>;
}

function StudentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const identity = useIdentity();
  const { session, profile, loading } = identity;
  const publicRoute = pathname === "/" || pathname === "/welcome" || pathname === "/account" || pathname === "/setup";
  const destination = !browserConfig.ok || loading || identity.error ? null
    : !session ? publicRoute ? null : "/"
    : !isProfileComplete(profile)
      ? pathname === "/profile" || pathname === "/account" || pathname === "/setup" ? null : "/profile"
      : pathname === "/welcome" ? "/" : null;

  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);

  if (loading && pathname !== "/account" && pathname !== "/setup") return <main className="onboarding-shell" role="status">Checking your account.</main>;
  if (destination) return <main className="onboarding-shell" role="status">Opening {destination === "/profile" ? "your profile" : "onboarding"}.</main>;
  if (identity.error && !publicRoute && pathname !== "/profile") return <main className="workflow-panel"><h1>Account access could not be checked</h1><p role="alert">{identity.error}</p><Button onClick={() => void identity.refresh()}>Retry</Button><Link href="/account">Open account</Link></main>;
  if (pathname === "/welcome" || pathname === "/account" || (pathname === "/" && !session) || (pathname === "/profile" && !isProfileComplete(profile))) {
    return <main className="onboarding-shell">{children}</main>;
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner"><Brand />
          <nav className="main-nav" aria-label="Main navigation">
            <NavLink href="/" aria-label="Home" className="nav-link"><Compass size={16} />Home</NavLink>
            <NavLink href="/events" aria-label="Events" className="nav-link"><CalendarDays size={17} />Explore Events</NavLink><NavLink href="/my-events" aria-label="My events" className="nav-link"><Bookmark size={17} />My Events</NavLink><NavLink href="/announcements" aria-label="Announcements" className="nav-link"><Bell size={17} />Announcements</NavLink><NavLink href="/profile" aria-label="Profile" className="nav-link"><UserRound size={17} />Profile</NavLink><NavLink href="/account" aria-label="Account" className="nav-link"><UserRound size={17} />Account</NavLink><NavLink href="/setup" aria-label="Setup" className="nav-link"><CircleHelp size={17} />Setup</NavLink>
          </nav>
          <div className="topbar-meta"><NavLink href="/announcements" className="header-icon-link" aria-label="Announcements"><Bell size={23} /></NavLink><NavLink href="/account" className="header-icon-link header-account-link" aria-label="Account"><UserRound size={23} /></NavLink></div>
        </div>
      </header>
      <main className="page-wrap">{children}</main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavLink href="/" className="mobile-nav-link"><Compass size={23} />Home</NavLink>
        <NavLink href="/events" className="mobile-nav-link"><CalendarDays size={23} />Events</NavLink>
        <NavLink href="/my-events" className="mobile-nav-link"><Bookmark size={23} />My Events</NavLink>
        <NavLink href="/profile" className="mobile-nav-link"><UserRound size={23} />Profile</NavLink>
      </nav>
      <footer className="site-footer"><span>TechSpace | Launchpad</span><span>Your universe. Your events. Your community.</span></footer>
    </div>
  );
}

export function HomePage() {
  const { session } = useIdentity();
  return session ? <><SetupNotice /><StudentDashboard /></> : <OnboardingPage />;
}

export function SetupPage() {
  return <section className="setup-page">
    <Link href="/" className="back-link"><ArrowLeft size={14} /> Back to home</Link>
    <div className="setup-heading"><span className="setup-icon"><Orbit size={22} /></span><span className="eyebrow muted-eyebrow">LOCAL CONFIGURATION</span><h1>Prepare your<br /><span>Launchpad.</span></h1><p>Connect this app to the shared project when its browser credentials are available. These settings do not grant account access; event workflows require a real session.</p></div>
    <div className="config-card"><div className="config-card-head"><span className={cn("config-led", browserConfig.ok && "config-led-ready")} /><div><strong>{browserConfig.ok ? "Browser settings found" : "Browser settings missing"}</strong><span>{browserConfig.ok ? "The required public values are present." : browserConfig.error}</span></div><span className="config-badge">{browserConfig.ok ? "READY" : "ACTION NEEDED"}</span></div>
      <div className="setup-steps"><div className="setup-step"><span>01</span><p>Copy <code>.env.example</code> to <code>.env.local</code> in <code>apps/student</code>.</p></div><div className="setup-step"><span>02</span><p>Set <code>NEXT_PUBLIC_MAIN_SUPABASE_URL</code> and <code>NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY</code> to the Project 1 public values.</p></div><div className="setup-step"><span>03</span><p>Restart the dev server. Never put a service-role or secret key in a browser app.</p></div></div>
      <div className="config-foot"><CircleHelp size={16} /><span>Events require a real session. Google sign-in requires provider setup; local development supports test accounts.</span></div>
    </div>
  </section>;
}

export function NotFoundPage() {
  return <section className="not-found"><span className="eyebrow muted-eyebrow">OFF THE MAP</span><strong>404</strong><h1>This page hasn’t<br />been charted.</h1><p>That route isn’t part of the current Launchpad preview.</p><Button asChild variant="outline"><Link href="/">Return home <ArrowRight size={16} /></Link></Button></section>;
}
