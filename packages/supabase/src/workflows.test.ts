import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isProfileComplete, workflowError, type ProfileRecord } from "./workflows";

const complete: ProfileRecord = {
  user_id: "student-id",
  full_name: "Student Name",
  roll_number: "10325210151",
  department: "Engineering",
  academic_year: 2,
  course: "B.Tech",
  branch: "Computer Science",
  section: "A",
  mobile_number: "+919876543210",
  verification_status: "unverified",
};

describe("student profile eligibility hint", () => {
  it("accepts complete self-declared details without institutional verification", () => {
    expect(isProfileComplete(complete)).toBe(true);
  });

  it("requires existing students to complete the new details", () => {
    expect(isProfileComplete({ ...complete, course: null, branch: null, section: null, mobile_number: null })).toBe(false);
    expect(isProfileComplete(null)).toBe(false);
  });

  it.each([
    { mobile_number: "12345" },
    { mobile_number: "9876543210ext2" },
    { section: " " },
    { academic_year: 9 },
    { academic_year: 1.5 },
    { roll_number: "bad/roll" },
  ])("keeps incomplete or invalid details in onboarding: %j", (fields) => {
    expect(isProfileComplete({ ...complete, ...fields })).toBe(false);
  });
});

describe("workflow error mapping", () => {
  it.each([
    ["ALREADY_CHECKED_IN", "This student is already checked in for this event."],
    ["WRONG_EVENT", "This QR code belongs to a different event."],
    ["OUTSIDE_CHECK_IN_WINDOW", "Check-in is only available while the event is actively running."],
    ["INVALID_QR", "Invalid QR code format. Please present a valid event QR code."],
    ["CORRECTION_REASON_REQUIRED", "A reason between 3 and 500 characters is required for attendance correction."],
    ["EVENT_REQUIRED_FOR_AUDIENCE", "Please select an event when targeting event registrants."],
  ])("maps %s code to helpful human text", (code, expected) => {
    expect(workflowError(new Error(`PGRST116: ${code}`))).toBe(expected);
  });
});

describe("dashboard read operations", () => {
  it("readAdminDashboard invokes admin_get_dashboard_summary RPC", async () => {
    const summary = {
      total_events: 5,
      published_events: 3,
      upcoming_events: 2,
      total_registrations: 10,
      total_check_ins: 4,
      events: [],
      recent_announcements: [],
    };
    const mockClient = {
      rpc: (fn: string) => {
        expect(fn).toBe("admin_get_dashboard_summary");
        return Promise.resolve({ data: summary, error: null });
      },
    } as unknown as SupabaseClient;

    const { readAdminDashboard } = await import("./workflows");
    const result = await readAdminDashboard(mockClient);
    expect(result).toEqual(summary);
  });

  it("readAdminDashboard throws on RPC failure", async () => {
    const mockClient = {
      rpc: () => Promise.resolve({ data: null, error: new Error("ADMIN_REQUIRED") }),
    } as unknown as SupabaseClient;

    const { readAdminDashboard } = await import("./workflows");
    await expect(readAdminDashboard(mockClient)).rejects.toThrow("ADMIN_REQUIRED");
  });

  it("readStudentDashboard combines upcoming events, registrations, attendance, and announcements", async () => {
    const now = new Date().toISOString();
    const event1 = { id: "e1", title: "Event 1", status: "published", starts_at: now, ends_at: now, venue: "Hall 1" };
    const reg1 = { id: "r1", event_id: "e1", created_at: now };
    const att1 = { event_id: "e1", checked_in: true, checked_at: now };
    const ann1 = { id: "a1", event_id: null, title: "Ann 1", body: "Body", link_url: null, audience: "all_students", published_at: now };

    const mockClient = {
      from: (table: string) => {
        if (table === "events") {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [event1], error: null }),
                  }),
                }),
              }),
              in: () => Promise.resolve({ data: [event1], error: null }),
            }),
          };
        }
        if (table === "registrations") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [reg1], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "attendance") {
          return {
            select: () => ({
              eq: () => ({
                in: () => Promise.resolve({ data: [att1], error: null }),
              }),
            }),
          };
        }
        if (table === "announcements") {
          return {
            select: () => ({
              order: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: [ann1], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const { readStudentDashboard } = await import("./workflows");
    const result = await readStudentDashboard(mockClient, "student-123");
    expect(result.upcomingEvents).toHaveLength(1);
    expect(result.registrations).toHaveLength(1);
    expect(result.registrations[0].checked_in).toBe(true);
    expect(result.registrations[0].event?.title).toBe("Event 1");
    expect(result.recentAnnouncements).toHaveLength(1);
  });
});
