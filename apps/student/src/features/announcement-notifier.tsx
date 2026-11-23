"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useIdentity } from "@launchpad/supabase";
import { toast } from "../components/ui/toast";
import { AnnouncementModal, type AnnouncementItem } from "../components/announcement-modal";

const LAST_SEEN_STORAGE_KEY = "launchpad_last_seen_announcement_id";
const LAST_READ_TIME_STORAGE_KEY = "launchpad_announcements_last_read_time";

interface AnnouncementNotificationContextType {
  unreadCount: number;
  markAllAsRead: () => void;
  openAnnouncementModal: (announcement: AnnouncementItem) => void;
}

const AnnouncementNotificationContext = createContext<AnnouncementNotificationContextType>({
  unreadCount: 0,
  markAllAsRead: () => {},
  openAnnouncementModal: () => {},
});

export function useAnnouncementNotifications() {
  return useContext(AnnouncementNotificationContext);
}

export function AnnouncementNotifierProvider({ children }: { children: ReactNode }) {
  const { client, session } = useIdentity();
  const pathname = usePathname();
  const [activeAnnouncement, setActiveAnnouncement] = useState<AnnouncementItem | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const mountedRef = useRef(true);

  const markAllAsRead = useCallback(() => {
    try {
      localStorage.setItem(LAST_READ_TIME_STORAGE_KEY, new Date().toISOString());
    } catch {
      // Ignore in restricted environments
    }
    setUnreadCount(0);
  }, []);

  // When visiting the announcements page, mark all as read
  useEffect(() => {
    if (pathname === "/announcements") {
      markAllAsRead();
    }
  }, [pathname, markAllAsRead]);

  const displayAnnouncementToast = useCallback((item: AnnouncementItem) => {
    try {
      localStorage.setItem(LAST_SEEN_STORAGE_KEY, item.id);
    } catch {
      // Ignore in restricted environments
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
      duration: 8000,
    });
  }, []);

  // 1. Initial check on mount: fetch latest announcement and unread count
  useEffect(() => {
    mountedRef.current = true;
    if (!client || !session) return;

    const timer = setTimeout(async () => {
      try {
        const lastReadTime = localStorage.getItem(LAST_READ_TIME_STORAGE_KEY);
        const lastSeenId = localStorage.getItem(LAST_SEEN_STORAGE_KEY);

        // Fetch recent announcements
        const { data, error } = await client
          .from("announcements")
          .select("id,event_id,title,body,link_url,audience,published_at")
          .order("published_at", { ascending: false })
          .limit(10);

        if (error || !data || !mountedRef.current) return;

        const items = data as AnnouncementItem[];
        if (items.length === 0) return;

        // Calculate unread count based on lastReadTime
        if (lastReadTime) {
          const unread = items.filter(
            (item) => new Date(item.published_at).getTime() > new Date(lastReadTime).getTime(),
          ).length;
          setUnreadCount(unread);
        } else {
          // If first time, show unread count for items from past 7 days
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const unread = items.filter(
            (item) => new Date(item.published_at).getTime() > sevenDaysAgo,
          ).length;
          setUnreadCount(unread);
        }

        // Show toast if the very latest announcement hasn't been toasted yet
        const latest = items[0];
        if (latest && latest.id !== lastSeenId && pathname !== "/announcements") {
          displayAnnouncementToast(latest);
        }
      } catch {
        // Silently skip
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      mountedRef.current = false;
    };
  }, [client, session, pathname, displayAnnouncementToast]);

  // 2. Realtime listener: instant trigger when admin publishes
  useEffect(() => {
    if (!client || !session) return;

    const channel = client
      .channel("realtime-announcements-notifications")
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

          // A) Club-wide announcements: instant zero-query toast
          if (announcement.audience === "all_students") {
            setUnreadCount((c) => c + 1);
            displayAnnouncementToast(announcement);
            return;
          }

          // B) Event-specific announcements: check enrollment
          if (announcement.audience === "event_registrants" && announcement.event_id) {
            try {
              const { data } = await client
                .from("registrations")
                .select("id")
                .eq("event_id", announcement.event_id)
                .eq("user_id", session.user.id)
                .maybeSingle();

              if (data && mountedRef.current) {
                setUnreadCount((c) => c + 1);
                displayAnnouncementToast(announcement);
              }
            } catch {
              // Silently ignore
            }
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, session, displayAnnouncementToast]);

  return (
    <AnnouncementNotificationContext.Provider
      value={{
        unreadCount,
        markAllAsRead,
        openAnnouncementModal: setActiveAnnouncement,
      }}
    >
      {children}
      <AnnouncementModal
        announcement={activeAnnouncement}
        onClose={() => setActiveAnnouncement(null)}
      />
    </AnnouncementNotificationContext.Provider>
  );
}
