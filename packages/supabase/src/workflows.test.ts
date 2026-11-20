import { describe, expect, it } from "vitest";
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
