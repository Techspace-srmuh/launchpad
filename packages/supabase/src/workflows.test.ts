import { describe, expect, it } from "vitest";
import { isProfileComplete, type ProfileRecord } from "./workflows";

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
