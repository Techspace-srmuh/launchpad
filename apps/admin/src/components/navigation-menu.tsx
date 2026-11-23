"use client";

import { Bell, CalendarDays, Home, LockKeyhole, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@launchpad/ui";

const items = [
  { title: "Overview", href: "/", icon: Home },
  { title: "Events", href: "/events", icon: CalendarDays },
  { title: "Announcements", href: "/announcements", icon: Bell },
  { title: "Admins", href: "/admins", icon: LockKeyhole },
  { title: "Profile", href: "/profile", icon: UserRound },
  { title: "Account", href: "/account", icon: UserRound },
  { title: "Setup", href: "/setup", icon: Settings2 },
];

export function AdminNavigationMenu() {
  const pathname = usePathname();
  return <nav className="main-nav" aria-label="Main navigation"><ul className="navigation-menu-list">
    {items.map(({ title, href, icon: Icon }) => {
      const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
      return <li key={href}><Link href={href} aria-current={active ? "page" : undefined}
        className={cn("navigation-menu-link", active && "navigation-menu-link-active")}>
        <Icon size={18} aria-hidden="true" /><span>{title}</span>
      </Link></li>;
    })}
  </ul></nav>;
}
