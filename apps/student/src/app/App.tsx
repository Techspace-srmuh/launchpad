import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, CircleHelp, Compass, Orbit, Sparkles } from "lucide-react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { Button, cn } from "@launchpad/ui";
import { readBrowserConfig, IdentityProvider } from "@launchpad/supabase";

import { AccessGate, AccountPage, ProfilePage } from "../features/account";
import { StudentEvents, StudentEventDetail } from "../features/events";

const browserConfig = readBrowserConfig(import.meta.env);

function Brand() {
  return <Link to="/" className="brand" aria-label="Launchpad home"><span className="brand-mark"><Orbit size={18} /></span><span>launchpad<span className="brand-dot">.</span></span></Link>;
}

function SetupNotice() {
  return (
    <div className={cn("setup-notice", browserConfig.ok ? "setup-notice-ready" : "")} role="status">
      <span className="notice-indicator" />
      <span>{browserConfig.ok ? "Browser configuration is ready" : "Setup needed to connect Launchpad"}</span>
      <Link to="/setup" className="notice-link">View setup <ArrowRight size={14} /></Link>
    </div>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner"><Brand />
          <nav className="main-nav" aria-label="Main navigation">
            <NavLink to="/" end aria-label="Home" className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}><Compass size={16} />Home</NavLink>
            <NavLink to="/events" aria-label="Events" className="nav-link"><CalendarDays size={16} />Events</NavLink><NavLink to="/my-events" aria-label="My events" className="nav-link"><Orbit size={16} />My events</NavLink><NavLink to="/profile" aria-label="Profile" className="nav-link"><Compass size={16} />Profile</NavLink><NavLink to="/account" aria-label="Account" className="nav-link"><Orbit size={16} />Account</NavLink><NavLink to="/setup" aria-label="Setup" className={({ isActive }) => cn("nav-link", isActive && "nav-link-active")}><CircleHelp size={16} />Setup</NavLink>
          </nav>
          <div className="topbar-meta"><span className="role-chip"><span />Student space</span><span className="avatar-placeholder" aria-label="Student app">S</span></div>
        </div>
      </header>
      <main className="page-wrap">{children}</main>
      <footer className="site-footer"><span>TechSpace | Launchpad</span><span>Your universe. Your events. Your community.</span></footer>
    </div>
  );
}

function HomePage() {
  return <>
    <SetupNotice />
    <section className="hero-panel">
      <div className="hero-grid" aria-hidden="true"><span className="planet planet-one" /><span className="planet planet-two" /><span className="orbit-line" /></div>
      <div className="hero-copy">
        <span className="eyebrow"><Sparkles size={14} /> YOUR CAMPUS, IN ORBIT</span>
        <h1>Make room for<br /><span>what’s next.</span></h1>
        <p>Your home for TechSpace events, people, and the moments worth showing up for.</p>
        <div className="hero-actions"><Button asChild><Link to="/events">Explore events <ArrowRight size={16} /></Link></Button><span className="quiet-note">Sign in to browse and register for published events.</span></div>
      </div>
      <div className="hero-index"><span>01</span><span className="index-rule" /><span>YOUR LAUNCHPAD</span></div>
    </section>

    <section className="content-section" aria-labelledby="next-heading">
      <div className="section-heading"><div><span className="eyebrow muted-eyebrow">THE NEXT STOPS</span><h2 id="next-heading">Your campus, coming together.</h2></div><span className="section-side-note">A first look at what Launchpad will bring into one place.</span></div>
      <div className="feature-grid">
        <article className="feature-card feature-card-highlight"><span className="feature-icon violet"><CalendarDays size={19} /></span><span className="status-pill">PLANNED</span><h3>Find your people</h3><p>Discover upcoming TechSpace events and keep the ones you’re joining close.</p><span className="feature-foot">EVENTS & REGISTRATION <ArrowUpRight size={14} /></span></article>
        <article className="feature-card"><span className="feature-icon blue"><Orbit size={19} /></span><span className="status-pill">PLANNED</span><h3>Keep your moments</h3><p>See your event details, attendance, and the resources shared with you.</p><span className="feature-foot">YOUR EVENT RECORD <ArrowUpRight size={14} /></span></article>
        <article className="feature-card"><span className="feature-icon mint"><Sparkles size={19} /></span><span className="status-pill">PLANNED</span><h3>Stay in the loop</h3><p>Read event announcements and find the links that matter, all in one place.</p><span className="feature-foot">UPDATES & RESOURCES <ArrowUpRight size={14} /></span></article>
      </div>
    </section>
    <section className="quiet-banner"><div className="quiet-banner-icon"><Compass size={18} /></div><div><strong>A clear start, with more on the horizon.</strong><span>Event records use the shared MAIN project. Google sign-in is still being prepared.</span></div><Link to="/setup" aria-label="Open setup page"><ArrowRight size={18} /></Link></section>
  </>;
}

function SetupPage() {
  return <section className="setup-page">
    <Link to="/" className="back-link"><ArrowLeft size={14} /> Back to home</Link>
    <div className="setup-heading"><span className="setup-icon"><Orbit size={22} /></span><span className="eyebrow muted-eyebrow">LOCAL CONFIGURATION</span><h1>Prepare your<br /><span>Launchpad.</span></h1><p>Connect this app to the shared project when its browser credentials are available. These settings do not grant account access; event workflows require a real session.</p></div>
    <div className="config-card"><div className="config-card-head"><span className={cn("config-led", browserConfig.ok && "config-led-ready")} /><div><strong>{browserConfig.ok ? "Browser settings found" : "Browser settings missing"}</strong><span>{browserConfig.ok ? "The required public values are present." : browserConfig.error}</span></div><span className="config-badge">{browserConfig.ok ? "READY" : "ACTION NEEDED"}</span></div>
      <div className="setup-steps"><div className="setup-step"><span>01</span><p>Copy <code>.env.example</code> to <code>.env.local</code> in <code>apps/student</code>.</p></div><div className="setup-step"><span>02</span><p>Set <code>VITE_MAIN_SUPABASE_URL</code> and <code>VITE_MAIN_SUPABASE_PUBLISHABLE_KEY</code> to the Project 1 public values.</p></div><div className="setup-step"><span>03</span><p>Restart the dev server. Never put a service-role or secret key in a browser app.</p></div></div>
      <div className="config-foot"><CircleHelp size={16} /><span>Events require a real session. Google sign-in is deferred; local development supports test accounts.</span></div>
    </div>
  </section>;
}

function NotFoundPage() {
  return <section className="not-found"><span className="eyebrow muted-eyebrow">OFF THE MAP</span><strong>404</strong><h1>This page hasn’t<br />been charted.</h1><p>That route isn’t part of the current Launchpad preview.</p><Button asChild variant="outline"><Link to="/">Return home <ArrowRight size={16} /></Link></Button></section>;
}

export default function App() {
  return <IdentityProvider config={browserConfig.ok ? browserConfig.config : null}><Layout><Routes><Route path="/" element={<HomePage />} /><Route path="/setup" element={<SetupPage />} /><Route path="/account" element={<AccountPage />} /><Route path="/profile" element={<AccessGate><ProfilePage /></AccessGate>} /><Route path="/events" element={<AccessGate><StudentEvents key="explore" /></AccessGate>} /><Route path="/events/:eventId" element={<AccessGate><StudentEventDetail /></AccessGate>} /><Route path="/my-events" element={<AccessGate><StudentEvents key="mine" mine /></AccessGate>} /><Route path="*" element={<NotFoundPage />} /></Routes></Layout></IdentityProvider>;
}
