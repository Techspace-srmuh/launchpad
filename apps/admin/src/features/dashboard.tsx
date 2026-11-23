"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CircleCheck,
  FileSpreadsheet,
  Plus,
  QrCode,
  RefreshCw,
  UsersRound,
  Zap,
} from "lucide-react";
import { Button } from "@launchpad/ui";
import {
  readAdminDashboard,
  useIdentity,
  workflowError,
  type AdminDashboardSummary,
} from "@launchpad/supabase";

import { DashboardAnalyticsChart } from "./dashboard-chart";
import { DashboardEventsTable } from "./dashboard-events-table";

export function AdminDashboard() {
  const { client, session, isAdmin } = useIdentity();
  const [data, setData] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!client || !session || !isAdmin) return;
    setLoading(true);
    setError("");
    void readAdminDashboard(client)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err: unknown) => {
        if (active) setError(workflowError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, session, isAdmin, version]);

  return (
    <div className="space-y-6 max-w-[1536px] mx-auto pb-8">
      {/* Introduction Hero Section */}
      <section className="bg-white rounded-[22px] border border-[#E9E9ED] p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <span className="inline-block text-[11px] font-bold text-[#8A6800] tracking-widest uppercase">
            ✦ ADMIN DASHBOARD ✦
          </span>
          <h1 className="text-[30px] sm:text-[34px] font-extrabold text-[#171717] tracking-tight leading-tight m-0">
            Operations{" "}
            <span className="relative inline-block">
              Overview
              <svg
                className="absolute left-0 -bottom-1.5 w-full h-2.5 text-[#FFD84D]"
                viewBox="0 0 100 12"
                fill="none"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M2 9.5C25 4.5 75 4 98 8"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p className="text-sm text-[#666B7A] font-normal leading-relaxed pt-1">
            Manage events, registrations, attendance, and announcements on Launchpad.
          </p>
        </div>

        {/* Astronaut Illustration with yellow circle & decorative stars */}
        <div className="flex items-center gap-4 self-center md:self-auto">
          <div className="relative flex items-center justify-center shrink-0">
            {/* Sparkle Stars */}
            <span
              className="absolute -top-1 -right-1 text-[#FFD84D] text-sm select-none font-bold"
              aria-hidden="true"
            >
              ✦
            </span>
            <span
              className="absolute bottom-2 -left-2 text-[#FFD84D] text-xs select-none font-bold"
              aria-hidden="true"
            >
              ✦
            </span>
            <span
              className="absolute -bottom-1 right-2 text-[#FFD84D] text-[10px] select-none font-bold"
              aria-hidden="true"
            >
              ✦
            </span>

            {/* Circular soft yellow background */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#FFF3BD]/75 flex items-center justify-center p-2.5 border border-[#FFE785]/50 shadow-2xs">
              <img
                src="/doodles/08_astronaut_coding_laptop.png"
                alt="Astronaut with laptop"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setVersion((v) => v + 1)}
            title="Refresh summary"
            className="p-2.5 rounded-xl border border-[#E9E9ED] bg-white hover:bg-[#FAFAFA] text-[#666B7A] hover:text-[#171717] transition-colors cursor-pointer self-start"
            aria-label="Refresh dashboard data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Loading & Error States */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-[22px] border border-[#E9E9ED] shadow-sm">
          <div className="inline-block w-8 h-8 border-3 border-[#FFD84D] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-[#666B7A] font-medium" role="status">
            Loading dashboard summary…
          </p>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-white rounded-[22px] border border-[#FECACA] shadow-sm">
          <p className="text-sm text-[#B91C1C] font-semibold mb-4" role="alert">
            {error}
          </p>
          <Button
            variant="outline"
            onClick={() => setVersion((v) => v + 1)}
            className="rounded-xl border-[#E9E9ED]"
          >
            Retry
          </Button>
        </div>
      ) : data ? (
        <>
          {/* Four KPI Statistic Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" aria-label="Key statistics">
            {/* Card 1: Total Events */}
            <Link
              href="/events"
              className="bg-gradient-to-br from-white to-[#FFFDF5] rounded-[22px] border border-[#E9E9ED] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-4 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#FFF3BD] text-[#8A6800] flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#666B7A] uppercase tracking-wider block">
                  Total Events
                </span>
                <p className="text-[32px] font-extrabold text-[#171717] leading-tight m-0 mt-0.5">
                  {data.total_events}
                </p>
              </div>
            </Link>

            {/* Card 2: Registrations */}
            <Link
              href="/events"
              className="bg-white rounded-[22px] border border-[#E9E9ED] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-4 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#F0ECFF] text-[#6941C6] flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <UsersRound className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#666B7A] uppercase tracking-wider block">
                  Total Registrations
                </span>
                <p className="text-[32px] font-extrabold text-[#171717] leading-tight m-0 mt-0.5">
                  {data.total_registrations}
                </p>
              </div>
            </Link>

            {/* Card 3: Check-ins */}
            <Link
              href="/events"
              className="bg-white rounded-[22px] border border-[#E9E9ED] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-4 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#E5F8E8] text-[#198038] flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <CircleCheck className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#666B7A] uppercase tracking-wider block">
                  Total Check-ins
                </span>
                <p className="text-[32px] font-extrabold text-[#171717] leading-tight m-0 mt-0.5">
                  {data.total_check_ins}
                </p>
              </div>
            </Link>

            {/* Card 4: Upcoming Events */}
            <Link
              href="/events"
              className="bg-white rounded-[22px] border border-[#E9E9ED] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-4 group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#EAF4FF] text-[#175CD3] flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#666B7A] uppercase tracking-wider block">
                  Upcoming Events
                </span>
                <p className="text-[32px] font-extrabold text-[#171717] leading-tight m-0 mt-0.5">
                  {data.upcoming_events}
                </p>
              </div>
            </Link>
          </section>

          {/* Main Analytics (62%) and Quick Actions (38%) Row */}
          <section className="grid grid-cols-1 lg:grid-cols-[1.62fr_1fr] gap-5 items-stretch">
            {/* Left — Registrations & Check-ins Chart */}
            <div className="min-w-0">
              <DashboardAnalyticsChart events={data.events} />
            </div>

            {/* Right — Quick Actions Card */}
            <div className="bg-white rounded-[22px] border border-[#E9E9ED] p-6 sm:p-7 shadow-sm flex flex-col justify-between h-full">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 rounded-lg bg-[#FFF3BD] text-[#8A6800] flex items-center justify-center">
                  <Zap className="w-4 h-4 fill-current text-[#8A6800]" />
                </div>
                <h2 className="text-[19px] font-bold text-[#171717] tracking-tight m-0">
                  Quick Actions
                </h2>
              </div>

              {/* Three Stacked Large Action Buttons */}
              <div className="space-y-3.5 flex-1 flex flex-col justify-center">
                {/* 1. Primary: Create New Event */}
                <Link
                  href="/events/new"
                  className="w-full p-4 rounded-xl bg-[#FFD84D] hover:bg-[#F5CE40] text-[#171717] flex items-center justify-between group shadow-xs transition-all duration-180"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black/10 flex items-center justify-center">
                      <Plus className="w-5 h-5 text-[#171717]" />
                    </div>
                    <span className="font-bold text-sm text-[#171717]">Create New Event</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#171717] group-hover:translate-x-1 transition-transform" />
                </Link>

                {/* 2. Secondary: Scan Attendance */}
                <Link
                  href={data.events.length > 0 ? `/events/${data.events[0].id}/attendance` : "/events"}
                  className="w-full p-4 rounded-xl bg-white hover:bg-[#FAFAFA] border border-[#E9E9ED] hover:border-[#D0D0D5] text-[#171717] flex items-center justify-between group shadow-2xs transition-all duration-180"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#FAFAFA] border border-[#E9E9ED] flex items-center justify-center">
                      <QrCode className="w-4 h-4 text-[#666B7A]" />
                    </div>
                    <span className="font-bold text-sm text-[#171717]">Scan Attendance</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#666B7A] group-hover:translate-x-1 group-hover:text-[#171717] transition-all" />
                </Link>

                {/* 3. Tertiary: Export Reports */}
                <Link
                  href={data.events.length > 0 ? `/events/${data.events[0].id}/export` : "/events"}
                  className="w-full p-4 rounded-xl bg-white hover:bg-[#FAFAFA] border border-[#E9E9ED] hover:border-[#D0D0D5] text-[#171717] flex items-center justify-between group shadow-2xs transition-all duration-180"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#FAFAFA] border border-[#E9E9ED] flex items-center justify-center">
                      <FileSpreadsheet className="w-4 h-4 text-[#666B7A]" />
                    </div>
                    <span className="font-bold text-sm text-[#171717]">Export Reports</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#666B7A] group-hover:translate-x-1 group-hover:text-[#171717] transition-all" />
                </Link>
              </div>
            </div>
          </section>

          {/* Recent Events Management Table */}
          <section aria-label="Recent events management">
            <DashboardEventsTable events={data.events} />
          </section>

          {/* Recent Announcements Accordion / Summary (Preserved for completeness) */}
          {data.recent_announcements.length > 0 && (
            <section className="bg-white rounded-[22px] border border-[#E9E9ED] p-6 sm:p-7 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#FFF3BD] text-[#8A6800] flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <h2 className="text-[19px] font-bold text-[#171717] tracking-tight m-0">
                    Recent Announcements
                  </h2>
                </div>
                <Link
                  href="/announcements"
                  className="text-xs font-semibold text-[#8A6800] hover:underline"
                >
                  Manage announcements →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.recent_announcements.slice(0, 3).map((ann) => (
                  <article
                    key={ann.id}
                    className="p-4 rounded-xl border border-[#E9E9ED] bg-[#FAFAFA] hover:bg-[#F5F5F7] transition-colors"
                  >
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E9E9ED] text-[#666B7A] mb-2 uppercase tracking-wide">
                      {ann.audience === "all_students" ? "All students" : "Event registrants"}
                    </span>
                    <h3 className="text-sm font-bold text-[#171717] line-clamp-1 mb-1">{ann.title}</h3>
                    <p className="text-xs text-[#666B7A] line-clamp-2 m-0">{ann.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
