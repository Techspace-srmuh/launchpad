"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Compass, House, LogOut, Megaphone, Search, Settings2, Ticket, UserRound } from "lucide-react";
import { cn } from "@launchpad/ui";
import { useIdentity, workflowError } from "@launchpad/supabase";
import { AstronautDoodle } from "./space-doodles";
import { NotificationBell } from "./ui/notification-bell";
import { useAnnouncementNotifications } from "../features/announcement-notifier";

function NavLink({ href, className, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  return <Link href={href} aria-current={active ? "page" : undefined} className={cn(className, active && "is-active")} {...props} />;
}

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/events", label: "Explore Events", icon: Compass },
  { href: "/my-events", label: "My Events", icon: Ticket },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
] as const;

function Brand() {
  return <Link href="/" className="student-brand" aria-label="TechSpace Launchpad home"><span className="student-brand-mark"><AstronautDoodle scene="planet" /></span><span className="student-brand-name"><strong>TechSpace</strong><small>Launchpad</small></span></Link>;
}

function StudentAccountMenu({ mobile = false }: { mobile?: boolean }) {
  const { client, session, profile } = useIdentity();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const name = profile?.full_name?.trim() || session?.user.email?.split("@")[0] || "Student";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const rawAvatar = session?.user.user_metadata?.avatar_url;
  const avatarUrl = typeof rawAvatar === "string" && /^https:\/\//i.test(rawAvatar) ? rawAvatar : null;

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const first = wrapper.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  async function signOut() {
    if (!client || busy) return;
    setBusy(true); setError("");
    try {
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
      setOpen(false);
      router.replace("/account");
    } catch (failure) { setError(workflowError(failure)); }
    finally { setBusy(false); }
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(wrapper.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    items[(current + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  }

  return <div className={cn("student-account", mobile && "student-account-mobile")} ref={wrapper}>
    <button ref={trigger} className="student-account-trigger" type="button" aria-label={`Open account menu for ${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => { setError(""); setOpen((value) => !value); }}>
      <span className="student-avatar">{avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : initials}</span>
      {!mobile && <span className="student-account-copy"><strong>{name}</strong><small>Student account</small></span>}
      {!mobile && <ChevronDown size={16} aria-hidden="true" className={cn(open && "student-chevron-open")} />}
    </button>
    {open && <div id={menuId} className="student-account-popover" role="menu" aria-label="Student account" onKeyDown={onMenuKeyDown}>
      <div className="student-account-popover-heading"><strong>{name}</strong><small>{session?.user.email}</small></div>
      <NavLink href="/profile" role="menuitem" className="student-account-option" onClick={() => setOpen(false)}><UserRound size={17} /> My Profile</NavLink>
      <NavLink href="/settings" role="menuitem" className="student-account-option" onClick={() => setOpen(false)}><Settings2 size={17} /> Account Settings</NavLink>
      <button type="button" role="menuitem" className="student-account-option student-signout" disabled={busy} onClick={() => void signOut()}><LogOut size={17} />{busy ? "Signing out…" : "Sign Out"}</button>
      {error && <p className="student-account-error" role="alert">{error}</p>}
    </div>}
  </div>;
}

export function StudentSidebar() {
  const { unreadCount } = useAnnouncementNotifications();
  return <aside className="student-sidebar" aria-label="Student sidebar">
    <Brand />
    <nav className="student-primary-nav" aria-label="Main navigation"><span className="student-nav-caption">DISCOVER</span>{links.map(({ href, label, icon: Icon }) => (
      <NavLink key={href} href={href} className="student-nav-link" title={label}>
        <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
        <span>{label}</span>
        {href === "/announcements" && unreadCount > 0 && (
          <span className="student-nav-badge" aria-label={`${unreadCount} unread announcements`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </NavLink>
    ))}</nav>
    <StudentAccountMenu />
  </aside>;
}

export function StudentHeader() {
  const { unreadCount } = useAnnouncementNotifications();
  return <header className="student-topbar"><div className="student-topbar-inner">
    <div className="student-header-title"><span>STUDENT SPACE</span><strong>Explore, join, and keep up.</strong></div>
    <div className="student-header-actions">
      <Link className="student-header-search" href="/events#event-search"><Search size={18} aria-hidden="true" /><span>Search events</span><ArrowRight size={15} aria-hidden="true" /></Link>
      <NavLink href="/announcements" className="student-header-icon relative" aria-label="Announcements" title="Announcements">
        <NotificationBell count={unreadCount} size={36} color="red" className="!bg-transparent border-0 shadow-none pointer-events-none" />
      </NavLink>
      <StudentAccountMenu mobile />
    </div>
  </div></header>;
}

export function StudentMobileNav() {
  const { unreadCount } = useAnnouncementNotifications();
  return <nav className="student-mobile-nav" aria-label="Mobile navigation">{links.map(({ href, label, icon: Icon }) => (
    <NavLink key={href} href={href} className="student-mobile-link relative">
      <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
      <span>{label === "Explore Events" ? "Explore" : label === "Announcements" ? "Updates" : label}</span>
      {href === "/announcements" && unreadCount > 0 && (
        <span className="student-mobile-badge" aria-hidden="true">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </NavLink>
  ))}</nav>;
}
