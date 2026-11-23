"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  House,
  LogOut,
  Megaphone,
  Menu,
  Rocket,
  Search,
  Settings,
  Settings2,
  Shield,
  User,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Button, cn } from "@launchpad/ui";
import { IdentityProvider, useIdentity } from "@launchpad/supabase";

import { browserConfig } from "../lib/config";
import { AdminDashboard } from "../features/dashboard";

function NavLink({
  href,
  className,
  activeExact = false,
  children,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { activeExact?: boolean }) {
  const pathname = usePathname();
  const active = activeExact
    ? pathname === href
    : pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 px-3.5 py-2.5 rounded-[13px] text-[14px] font-medium transition-all duration-180",
        active
          ? "bg-[#1C1C1C] text-white shadow-xs font-semibold pl-4"
          : "text-[#666B7A] hover:bg-[#F5F5F7] hover:text-[#171717]",
        className
      )}
      {...props}
    >
      {active && (
        <span
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-[#FFD84D]"
          aria-hidden="true"
        />
      )}
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  activeExact = false,
  children,
}: {
  href: string;
  activeExact?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeExact
    ? pathname === href
    : pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0",
        active
          ? "bg-[#1C1C1C] text-white shadow-xs"
          : "bg-[#FAFAFA] border border-[#E9E9ED] text-[#666B7A] hover:text-[#171717] hover:bg-[#F5F5F7]"
      )}
    >
      {children}
    </Link>
  );
}

function SidebarBrand() {
  return (
    <div className="p-6 pb-4 border-b border-[#E9E9ED]/60">
      <Link href="/" className="flex items-center gap-3 group" aria-label="Launchpad Control overview">
        <div className="w-10 h-10 rounded-xl bg-[#FFD84D] flex items-center justify-center text-[#171717] shadow-sm shrink-0 group-hover:scale-[1.02] transition-transform">
          <Rocket className="w-5 h-5 fill-current" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-[17px] text-[#171717] tracking-tight leading-tight">
            TechSpace
          </span>
          <span className="text-[12px] text-[#666B7A] font-medium leading-tight">
            Launchpad Control
          </span>
        </div>
      </Link>
      <div className="mt-3 flex items-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FFF3BD] text-[#8A6800] text-[11px] font-bold tracking-wide">
          Admin
        </span>
      </div>
    </div>
  );
}

function AdminAccountCard() {
  const { session, profile, client } = useIdentity();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    if (!client) return;
    setBusy(true);
    try {
      await client.auth.signOut();
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const displayName = profile?.full_name || session?.user?.email?.split("@")[0] || "Admin";
  const initial = (profile?.full_name?.[0] || session?.user?.email?.[0] || "A").toUpperCase();
  const roleLabel = "Super Admin";

  return (
    <div className="p-4 border-t border-[#E9E9ED] mt-auto relative" ref={menuRef}>
      {menuOpen && (
        <div
          role="menu"
          aria-label="Admin account menu"
          className="absolute bottom-full mb-2 left-4 right-4 bg-white border border-[#E9E9ED] rounded-2xl shadow-xl p-2 z-50 animate-in fade-in-50 zoom-in-95 duration-150"
        >
          <div className="px-3 py-2 border-b border-[#E9E9ED]/80 mb-1">
            <p className="text-xs font-semibold text-[#171717] truncate">{displayName}</p>
            <p className="text-[11px] text-[#858B98] truncate">{session?.user?.email || "admin@techspace.club"}</p>
          </div>
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#171717] rounded-xl hover:bg-[#F5F5F7] transition-colors"
          >
            <User className="w-4 h-4 text-[#666B7A]" />
            My Profile
          </Link>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#171717] rounded-xl hover:bg-[#F5F5F7] transition-colors"
          >
            <Settings className="w-4 h-4 text-[#666B7A]" />
            Account Settings
          </Link>
          <div className="my-1 border-t border-[#E9E9ED]/80" />
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void handleSignOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#B91C1C] rounded-xl hover:bg-[#FEE2E2]/50 transition-colors text-left cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[#B91C1C]" />
            {busy ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      )}

      <button
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        onClick={() => setMenuOpen((open) => !open)}
        className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white border border-[#E9E9ED] hover:bg-[#FAFAFA] hover:border-[#D6D6DC] transition-all cursor-pointer shadow-xs text-left"
      >
        <div className="w-9 h-9 rounded-full bg-[#FFD84D] text-[#171717] font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
          {initial}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-semibold text-[13px] text-[#171717] truncate leading-tight">
            {displayName}
          </span>
          <span className="text-[11px] text-[#858B98] truncate leading-tight mt-0.5">
            {roleLabel}
          </span>
        </div>
        <ChevronRight className={cn("w-4 h-4 text-[#858B98] transition-transform shrink-0", menuOpen && "rotate-90")} />
      </button>
    </div>
  );
}

export function SetupNotice() {
  return (
    <div className={cn("setup-notice", browserConfig.ok ? "setup-notice-ready" : "")} role="status">
      <span className="notice-indicator" />
      <span>{browserConfig.ok ? "Browser configuration is ready" : "Setup needed to connect Control"}</span>
      <Link href="/setup" className="notice-link">
        View setup <ArrowRight size={13} />
      </Link>
    </div>
  );
}

function DesktopSidebarNav() {
  return (
    <nav className="hidden lg:flex flex-1 flex-col px-4 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
      <NavLink href="/" activeExact>
        <House className="w-5 h-5 shrink-0" />
        Overview
      </NavLink>
      <NavLink href="/events">
        <CalendarDays className="w-5 h-5 shrink-0" />
        Events
      </NavLink>
      <NavLink href="/events">
        <UsersRound className="w-5 h-5 shrink-0" />
        Registrations
      </NavLink>
      <NavLink href="/events">
        <CircleCheck className="w-5 h-5 shrink-0" />
        Attendance
      </NavLink>
      <NavLink href="/announcements">
        <Megaphone className="w-5 h-5 shrink-0" />
        Announcements
      </NavLink>
      <NavLink href="/admins">
        <Shield className="w-5 h-5 shrink-0" />
        Admins
      </NavLink>
      <NavLink href="/events">
        <ChartNoAxesColumn className="w-5 h-5 shrink-0" />
        Reports
      </NavLink>

      <div className="my-3 border-t border-[#E9E9ED]" />

      <NavLink href="/setup">
        <Settings className="w-5 h-5 shrink-0" />
        Setup
      </NavLink>
      <NavLink href="/account">
        <User className="w-5 h-5 shrink-0" />
        Account
      </NavLink>
    </nav>
  );
}

function MobileNavRail() {
  return (
    <nav
      className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-white border-b border-[#E9E9ED] overflow-x-auto scrollbar-none"
      aria-label="Main navigation"
    >
      <MobileNavLink href="/" activeExact>
        Overview
      </MobileNavLink>
      <MobileNavLink href="/events">
        Events
      </MobileNavLink>
      <MobileNavLink href="/events">
        Registrations
      </MobileNavLink>
      <MobileNavLink href="/events">
        Attendance
      </MobileNavLink>
      <MobileNavLink href="/announcements">
        Announcements
      </MobileNavLink>
      <MobileNavLink href="/admins">
        Admins
      </MobileNavLink>
      <MobileNavLink href="/events">
        Reports
      </MobileNavLink>
      <MobileNavLink href="/setup">
        Setup
      </MobileNavLink>
      <MobileNavLink href="/account">
        Account
      </MobileNavLink>
    </nav>
  );
}

function TopHeader({ onToggleMobileNav }: { onToggleMobileNav: () => void }) {
  const pathname = usePathname();
  const { session, profile } = useIdentity();
  const [notificationOpen, setNotificationOpen] = useState(false);

  let pageTitle = "Overview";
  if (pathname.startsWith("/events")) pageTitle = "Events";
  else if (pathname.startsWith("/announcements")) pageTitle = "Announcements";
  else if (pathname.startsWith("/admins")) pageTitle = "Admins";
  else if (pathname.startsWith("/setup")) pageTitle = "Setup";
  else if (pathname.startsWith("/account")) pageTitle = "Account";
  else if (pathname.startsWith("/profile")) pageTitle = "Profile";

  const initial = (profile?.full_name?.[0] || session?.user?.email?.[0] || "A").toUpperCase();

  return (
    <header className="h-20 min-h-[80px] bg-white border-b border-[#E9E9ED] px-6 sm:px-10 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label="Toggle navigation menu"
          className="lg:hidden p-2 rounded-xl border border-[#E9E9ED] text-[#666B7A] hover:bg-[#FAFAFA] cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-[26px] font-bold text-[#171717] tracking-tight m-0 leading-tight block">
          {pageTitle}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Search Input */}
        <div className="relative hidden md:block w-72 lg:w-96">
          <Search className="w-4 h-4 text-[#858B98] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search events, users, registrations..."
            className="w-full pl-10 pr-12 py-2.5 rounded-full bg-[#FAFAFA] border border-[#E9E9ED] text-sm text-[#171717] placeholder-[#858B98] focus:outline-none focus:border-[#FFD84D] focus:bg-white focus:ring-2 focus:ring-[#FFD84D]/25 transition-all"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const target = e.currentTarget.value.trim();
                if (target) window.location.href = `/events?search=${encodeURIComponent(target)}`;
              }
            }}
          />
          <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold text-[#858B98] bg-white border border-[#E9E9ED] rounded shadow-2xs pointer-events-none">
            ⌘K
          </kbd>
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            type="button"
            aria-label="View notifications"
            onClick={() => setNotificationOpen((open) => !open)}
            className="w-10 h-10 rounded-xl border border-[#E9E9ED] bg-white hover:bg-[#FAFAFA] flex items-center justify-center text-[#666B7A] transition-colors relative cursor-pointer"
          >
            <Bell className="w-5 h-5" />
            <span className="w-2 h-2 rounded-full bg-[#FFD84D] ring-2 ring-white absolute top-2.5 right-2.5" />
          </button>

          {notificationOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-[#E9E9ED] rounded-2xl shadow-xl p-4 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-[#E9E9ED]">
                <strong className="text-xs font-bold text-[#171717]">Announcements</strong>
                <Link
                  href="/announcements"
                  onClick={() => setNotificationOpen(false)}
                  className="text-[11px] font-semibold text-[#8A6800] hover:underline"
                >
                  View All
                </Link>
              </div>
              <p className="text-xs text-[#666B7A] py-4 text-center">
                Check announcements view for community bulletins.
              </p>
            </div>
          )}
        </div>

        {/* User avatar */}
        <Link
          href="/account"
          aria-label="Admin account"
          className="w-10 h-10 rounded-full bg-[#FFD84D] text-[#171717] font-bold text-sm flex items-center justify-center border border-[#E9E9ED] shadow-2xs hover:scale-105 transition-transform"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <IdentityProvider config={browserConfig.ok ? browserConfig.config : null}>
      <div className="min-h-screen bg-[#FAFAFA] flex overflow-x-hidden">
        {/* Mobile Backdrop */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[288px] bg-white border-r border-[#E9E9ED] flex flex-col transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 shrink-0",
            mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex items-center justify-between lg:block">
            <SidebarBrand />
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-3 mr-2 text-[#858B98] hover:text-[#171717]"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <DesktopSidebarNav />

          <AdminAccountCard />
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 max-w-full">
          <TopHeader onToggleMobileNav={() => setMobileNavOpen((open) => !open)} />
          <MobileNavRail />

          <main className="flex-1 px-6 py-6 sm:px-10 sm:py-8 max-w-[1536px] w-full mx-auto">
            {children}
          </main>

          <footer className="border-t border-[#E9E9ED] py-4 px-6 sm:px-10 text-xs text-[#858B98] flex items-center justify-between">
            <span>TechSpace Launchpad Control</span>
            <span>Production Event Operations</span>
          </footer>
        </div>
      </div>
    </IdentityProvider>
  );
}

export function OverviewPage() {
  const { session, isAdmin } = useIdentity();

  return (
    <>
      <SetupNotice />
      {session && isAdmin ? (
        <AdminDashboard />
      ) : session && !isAdmin ? (
        <section className="workflow-panel">
          <h1>Admin access required</h1>
          <p>This account ({session.user.email}) is not authorized for admin operations.</p>
          <div className="workflow-actions">
            <Link href="/account" className="font-semibold text-[#8A6800] underline">
              Open account
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="workflow-panel p-8 sm:p-10 rounded-[22px] bg-white border border-[#E9E9ED] shadow-sm mb-8 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-[#8A6800] bg-[#FFF3BD] px-3 py-1 rounded-full mb-4">
                ✦ CONTROL ROOM ✦
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-[#171717] tracking-tight leading-tight mb-3">
                Good work starts with a clear view.
              </h1>
              <p className="text-sm sm:text-base text-[#666B7A] leading-relaxed mb-6">
                One calm, organized dashboard to manage the TechSpace events your community shows up for.
              </p>
              <div className="flex items-center gap-4">
                <Button asChild className="bg-[#FFD84D] hover:bg-[#F5CE40] text-[#171717] font-semibold rounded-xl px-5 py-2.5 shadow-xs">
                  <Link href="/account">
                    Sign in to Control <ArrowRight size={16} className="ml-2" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl border-[#E9E9ED] text-[#171717] hover:bg-[#FAFAFA]">
                  <Link href="/setup">View setup</Link>
                </Button>
              </div>
            </div>

            <div className="w-44 h-44 rounded-full bg-[#FFF3BD]/60 flex items-center justify-center p-4 relative shrink-0">
              <img
                src="/doodles/08_astronaut_coding_laptop.png"
                alt="Astronaut with laptop"
                className="w-full h-full object-contain"
              />
            </div>
          </section>

          <section className="workflow-panel">
            <h2>Operations overview</h2>
            <p>
              Real-time event, registration, and attendance summaries across TechSpace Launchpad. Sign in with an authorized admin account to access active controls.
            </p>
            <div className="workflow-actions mt-4">
              <Button asChild className="bg-[#FFD84D] text-[#171717] hover:bg-[#F5CE40] rounded-xl font-semibold">
                <Link href="/account">Open account</Link>
              </Button>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export function SetupPage() {
  return (
    <section className="setup-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={14} /> Back to overview
      </Link>
      <div className="setup-heading">
        <span className="setup-icon">
          <Settings2 size={24} />
        </span>
        <span className="inline-block text-[11px] font-bold text-[#8A6800] tracking-widest uppercase mb-1">
          LOCAL CONFIGURATION
        </span>
        <h1>
          Set up the <span>control room.</span>
        </h1>
        <p>
          Provide the public browser settings for Project 1 when available. Event workflows use authenticated access to this project.
        </p>
      </div>

      <div className="config-card">
        <div className="config-card-head">
          <span className={cn("config-led", browserConfig.ok && "config-led-ready")} />
          <div>
            <strong>{browserConfig.ok ? "Browser settings found" : "Browser settings missing"}</strong>
            <span>{browserConfig.ok ? "The required public values are present." : browserConfig.error}</span>
          </div>
          <span className="config-badge">{browserConfig.ok ? "READY" : "ACTION NEEDED"}</span>
        </div>

        <div className="setup-steps">
          <div className="setup-step">
            <span>01</span>
            <p>
              Copy <code>.env.example</code> to <code>.env.local</code> in <code>apps/admin</code>.
            </p>
          </div>
          <div className="setup-step">
            <span>02</span>
            <p>
              Set <code>NEXT_PUBLIC_MAIN_SUPABASE_URL</code> and <code>NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY</code> to the Project 1 public values.
            </p>
          </div>
          <div className="setup-step">
            <span>03</span>
            <p>
              Restart the dev server. Browser keys are public; service-role and other secrets stay server-side.
            </p>
          </div>
        </div>

        <div className="config-foot">
          <CircleHelp size={16} />
          <span>
            Admin authority is checked by the backend. Google sign-in requires provider setup; development supports test accounts.
          </span>
        </div>
      </div>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="not-found">
      <span className="inline-block text-[11px] font-bold text-[#8A6800] tracking-widest uppercase mb-2">
        UNMAPPED ROUTE
      </span>
      <strong>404</strong>
      <h1>
        This view is still on the drawing board.
      </h1>
      <p>That route isn’t part of the current Control preview.</p>
      <Button asChild variant="outline" className="rounded-xl border-[#E9E9ED] text-[#171717] hover:bg-[#FAFAFA]">
        <Link href="/">
          Return to overview <ArrowRight size={16} className="ml-2" />
        </Link>
      </Button>
    </section>
  );
}
