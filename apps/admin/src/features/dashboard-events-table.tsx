"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  FileSpreadsheet,
  FolderOpen,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  QrCode,
  Users,
} from "lucide-react";
import type { AdminDashboardEvent } from "@launchpad/supabase";
import { Button } from "@launchpad/ui";

interface DashboardEventsTableProps {
  events: AdminDashboardEvent[];
  searchQuery?: string;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

export function DashboardEventsTable({ events, searchQuery = "" }: DashboardEventsTableProps) {
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownId(null);
      }
    }
    if (activeDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeDropdownId]);

  const filteredEvents = searchQuery.trim()
    ? events.filter((e) =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.venue.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : events;

  return (
    <div className="bg-white rounded-[22px] border border-[#E9E9ED] p-6 sm:p-7 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FFF3BD] text-[#8A6800] flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4" />
          </div>
          <h2 className="text-[19px] font-bold text-[#171717] tracking-tight m-0">Recent Events</h2>
        </div>

        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#171717] hover:text-[#8A6800] transition-colors"
        >
          <span>View All</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Table content */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-[#E9E9ED] rounded-xl bg-[#FAFAFA]">
          <CalendarDays className="w-8 h-8 text-[#858B98] mx-auto mb-2" />
          <p className="text-sm font-medium text-[#171717] mb-1">
            {searchQuery ? "No events matched your search" : "No events created yet"}
          </p>
          <p className="text-xs text-[#666B7A] mb-4">
            {searchQuery
              ? "Try searching for a different keyword or view all events."
              : "Create your first Launchpad event to begin accepting registrations."}
          </p>
          <Button asChild className="bg-[#FFD84D] hover:bg-[#F5CE40] text-[#171717] font-semibold rounded-xl">
            <Link href="/events/new">
              <Plus className="w-4 h-4 mr-1.5" /> Create New Event
            </Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-[#F7F7F8] rounded-xl overflow-hidden text-[11px] font-semibold text-[#858B98] uppercase tracking-wider">
                <th className="py-3 px-4 rounded-l-xl">Event</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Registrations</th>
                <th className="py-3 px-4">Check-ins</th>
                <th className="py-3 px-4 text-right rounded-r-xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E9ED]/60 text-sm">
              {filteredEvents.map((event) => {
                const isPublished = event.status === "published";
                const isDraft = event.status === "draft";
                const isDropdownOpen = activeDropdownId === event.id;

                return (
                  <tr
                    key={event.id}
                    className="hover:bg-[#FBFBFC] transition-colors duration-150 group"
                  >
                    {/* Event name & icon */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#FFF3BD] text-[#8A6800] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          {event.title.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-[#171717] group-hover:text-[#8A6800] transition-colors line-clamp-1">
                          {event.title}
                        </span>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isPublished
                            ? "bg-[#E5F8E8] text-[#198038]"
                            : isDraft
                            ? "bg-[#F3F4F6] text-[#4B5563]"
                            : "bg-[#FEE2E2] text-[#B91C1C]"
                        }`}
                      >
                        {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                      </span>
                    </td>

                    {/* Date & Time / Venue */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-[#171717]" suppressHydrationWarning>
                          <Calendar className="w-3.5 h-3.5 text-[#858B98] shrink-0" />
                          <span>{formatDate(event.starts_at)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[#666B7A]">
                          <MapPin className="w-3.5 h-3.5 text-[#858B98] shrink-0" />
                          <span className="truncate max-w-[180px]">{event.venue}</span>
                        </div>
                      </div>
                    </td>

                    {/* Registrations */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="text-xs">
                        <span className="font-bold text-[#171717] text-sm">
                          {event.registration_count}
                        </span>
                        <span className="text-[#858B98] font-medium ml-1">
                          {event.capacity ? `/ ${event.capacity}` : "(no cap)"}
                        </span>
                      </div>
                    </td>

                    {/* Check-ins */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E5F8E8] text-[#198038]">
                        {event.attendance_count} present
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 relative">
                        {/* Edit Button */}
                        <Link
                          href={`/events/${event.id}/edit`}
                          aria-label={`Edit ${event.title}`}
                          className="w-8 h-8 rounded-lg border border-[#E9E9ED] bg-white hover:bg-[#FAFAFA] flex items-center justify-center text-[#666B7A] hover:text-[#171717] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>

                        {/* Three-dot Overflow Menu */}
                        <div className="relative">
                          <button
                            type="button"
                            aria-label="More options"
                            aria-expanded={isDropdownOpen}
                            onClick={() =>
                              setActiveDropdownId(isDropdownOpen ? null : event.id)
                            }
                            className="w-8 h-8 rounded-lg border border-[#E9E9ED] bg-white hover:bg-[#FAFAFA] flex items-center justify-center text-[#666B7A] hover:text-[#171717] transition-colors cursor-pointer"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {isDropdownOpen && (
                            <div
                              ref={dropdownRef}
                              role="menu"
                              className="absolute right-0 mt-1.5 w-48 bg-white border border-[#E9E9ED] rounded-xl shadow-xl p-1.5 z-40 text-left animate-in fade-in-50 zoom-in-95 duration-150"
                            >
                              <Link
                                href={`/events/${event.id}/participants`}
                                role="menuitem"
                                onClick={() => setActiveDropdownId(null)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#171717] rounded-lg hover:bg-[#F5F5F7] transition-colors"
                              >
                                <Users className="w-3.5 h-3.5 text-[#666B7A]" />
                                View Participants
                              </Link>
                              <Link
                                href={`/events/${event.id}/attendance`}
                                role="menuitem"
                                onClick={() => setActiveDropdownId(null)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#171717] rounded-lg hover:bg-[#F5F5F7] transition-colors"
                              >
                                <QrCode className="w-3.5 h-3.5 text-[#666B7A]" />
                                Scan Attendance
                              </Link>
                              <Link
                                href={`/events/${event.id}/export`}
                                role="menuitem"
                                onClick={() => setActiveDropdownId(null)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#171717] rounded-lg hover:bg-[#F5F5F7] transition-colors"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-[#666B7A]" />
                                Export Registrations
                              </Link>
                              <Link
                                href={`/events/${event.id}/materials`}
                                role="menuitem"
                                onClick={() => setActiveDropdownId(null)}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#171717] rounded-lg hover:bg-[#F5F5F7] transition-colors"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-[#666B7A]" />
                                Manage Materials
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
