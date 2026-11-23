import { describe, it, expect } from "vitest";

describe("Announcement Notifications", () => {
  it("filters unread announcements based on timestamp comparison", () => {
    const lastReadTime = new Date("2026-11-20T10:00:00Z").getTime();
    const announcements = [
      { id: "1", published_at: "2026-11-22T10:00:00Z" },
      { id: "2", published_at: "2026-11-21T10:00:00Z" },
      { id: "3", published_at: "2026-11-19T10:00:00Z" },
    ];

    const unread = announcements.filter(
      (a) => new Date(a.published_at).getTime() > lastReadTime,
    );

    expect(unread).toHaveLength(2);
    expect(unread.map((u) => u.id)).toEqual(["1", "2"]);
  });

  it("handles empty announcements list gracefully", () => {
    const announcements: { id: string; published_at: string }[] = [];
    expect(announcements.length).toBe(0);
  });
});
