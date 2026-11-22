import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/shell";
import "../index.css";

export const metadata: Metadata = { title: "Launchpad Control - TechSpace", description: "Launchpad Control — TechSpace event operations." };
export const viewport: Viewport = { themeColor: "#f8f7f2" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body><AppShell>{children}</AppShell></body></html>;
}
