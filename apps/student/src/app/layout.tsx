import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/shell";
import "../index.css";
import "../student-theme.css";
import "../reference-theme.css";
import "../onboarding-theme.css";

export const metadata: Metadata = { title: "Launchpad - TechSpace", description: "Launchpad — your universe, your events, your community." };
export const viewport: Viewport = { themeColor: "#ffffff", viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body><AppShell>{children}</AppShell></body></html>;
}
