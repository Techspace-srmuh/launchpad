"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { X, Bell, ArrowUpRight, Calendar } from "lucide-react";

export interface AnnouncementItem {
  id: string;
  event_id: string | null;
  title: string;
  body: string;
  link_url: string | null;
  audience: "all_students" | "event_registrants";
  published_at: string;
}

interface AnnouncementModalProps {
  announcement: AnnouncementItem | null;
  onClose: () => void;
}

export function AnnouncementModal({ announcement, onClose }: AnnouncementModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!announcement) return;
    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scrolling while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [announcement, handleKeyDown]);

  if (!announcement) return null;

  const formattedDate = new Date(announcement.published_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div
      className="announcement-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="announcement-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="announcement-modal-header">
          <div className="announcement-modal-meta">
            <span className="announcement-modal-badge">
              <Bell size={13} aria-hidden="true" />
              {announcement.audience === "all_students" ? "Club Announcement" : "Event Update"}
            </span>
            <time dateTime={announcement.published_at}>{formattedDate}</time>
          </div>
          <button
            type="button"
            className="announcement-modal-close"
            onClick={onClose}
            aria-label="Close announcement dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="announcement-modal-body">
          <h2 id="announcement-modal-title" className="announcement-modal-title">
            {announcement.title}
          </h2>
          <p className="announcement-modal-text">{announcement.body}</p>
        </div>

        <div className="announcement-modal-footer">
          {announcement.event_id && (
            <Link
              href={`/events/${announcement.event_id}`}
              onClick={onClose}
              className="announcement-modal-btn primary"
            >
              <Calendar size={15} aria-hidden="true" />
              <span>View Event</span>
            </Link>
          )}

          {announcement.link_url && (
            <a
              href={announcement.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="announcement-modal-btn outline"
            >
              <span>Open Resource</span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="announcement-modal-btn secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
