"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useIdentity } from "@launchpad/supabase";
import { toast } from "../components/ui/toast";
import { AnnouncementModal, type AnnouncementItem } from "../components/announcement-modal";

const LAST_SEEN_STORAGE_KEY = "launchpad_last_seen_announcement_id";

/**
 * Calculates a jittered delay (in ms) to prevent thundering-herd database spikes
 * when an event-specific announcement is broadcast.
 */
export function calculateJitterDelay(minMs = 1500, maxMs = 4000): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

export function AnnouncementNotifier() {
  const { client, session } = useIdentity();
  const [activeAnnouncement, setActiveAnnouncement] = useState<AnnouncementItem | null>(null);
  const mountedRef = useRef(true);

  const displayAnnouncementToast = useCallback((item: AnnouncementItem) => {
    // Record as seen so we don't toast the same announcement multiple times
    try {
      localStorage.setItem(LAST_SEEN_STORAGE_KEY, item.id);
    } catch {
      // Ignore localStorage write errors in private browsing/sandboxed contexts
    }

    const snippet =
      item.body.length > 85 ? `${item.body.slice(0, 85).trim()}…` : item.body;

    toast(item.title, {
      description: snippet,
      action: {
        label: "Read",
        onClick: () => {
          setActiveAnnouncement(item);
        },
      },
      duration: 9000,
    });
  }, []);

  // 1. "New on open" delayed check (2s after mount to not block initial page queries)
  useEffect(() => {
    mountedRef.current = true;
    if (!client || !session) return;

    const timer = setTimeout(async () => {
      try {
        const lastSeen = localStorage.getItem(LAST_SEEN_STORAGE_KEY);
        // Query only the single most recent visible announcement (filtered by RLS)
        const { data, error } = await client
          .from("announcements")
          .select("id,event_id,title,body,link_url,audience,published_at")
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !data || !mountedRef.current) return;

        const latest = data as AnnouncementItem;
        if (latest.id !== lastSeen) {
          displayAnnouncementToast(latest);
        }
      } catch {
        // Silently skip if network or auth is temporarily unavailable
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      mountedRef.current = false;
    };
  }, [client, session, displayAnnouncementToast]);

  // 2. Realtime listener for immediate broadcast with database load protection
  useEffect(() => {
    if (!client || !session) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const channel = client
      .channel("public-announcements-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "announcements",
        },
        async (payload) => {
          const newRow = payload.new as Partial<AnnouncementItem>;
          if (!newRow || !newRow.id || !newRow.title || !newRow.body) return;

          const announcement: AnnouncementItem = {
            id: newRow.id,
            event_id: newRow.event_id ?? null,
            title: newRow.title,
            body: newRow.body,
            link_url: newRow.link_url ?? null,
            audience: newRow.audience ?? "all_students",
            published_at: newRow.published_at ?? new Date().toISOString(),
          };

          // Database Load Protection:
          // A) Club-wide announcements require ZERO database reads!
          if (announcement.audience === "all_students") {
            displayAnnouncementToast(announcement);
            return;
          }

          // B) Event-specific announcements:
          // Stagger queries across clients using randomized jitter delay (1.5s - 4.0s)
          // so Supabase connection pools never get overwhelmed.
          if (announcement.audience === "event_registrants" && announcement.event_id) {
            const jitterMs = calculateJitterDelay();
            timeoutId = setTimeout(async () => {
              try {
                // Verify the student is registered for this event
                const { data } = await client
                  .from("registrations")
                  .select("id")
                  .eq("event_id", announcement.event_id as string)
                  .eq("user_id", session.user.id)
                  .maybeSingle();

                if (data && mountedRef.current) {
                  displayAnnouncementToast(announcement);
                }
              } catch {
                // Graceful ignore
              }
            }, jitterMs);
          }
        },
      )
      .subscribe();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      void client.removeChannel(channel);
    };
  }, [client, session, displayAnnouncementToast]);

  return (
    <AnnouncementModal
      announcement={activeAnnouncement}
      onClose={() => setActiveAnnouncement(null)}
    />
  );
}
