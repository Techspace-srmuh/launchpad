import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/shell";
import "../index.css";

export const metadata: Metadata = { title: "Launchpad - TechSpace", description: "Launchpad — your universe, your events, your community." };
export const viewport: Viewport = { themeColor: "#080b16" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
