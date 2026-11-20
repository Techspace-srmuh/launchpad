import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProfileRecord {
  user_id: string;
  full_name: string;
  roll_number: string;
  department: string;
  academic_year: number;
  course: string | null;
  branch: string | null;
  section: string | null;
  mobile_number: string | null;
  verification_status: "unverified" | "verified";
}

// Completeness is a usability hint. The registration RPC enforces eligibility.
export function isProfileComplete(profile: ProfileRecord | null | undefined): boolean {
  if (!profile) return false;
  return [profile.full_name, profile.department, profile.course, profile.branch, profile.section]
    .every((value) => typeof value === "string" && value.trim().length > 0)
    && /^[A-Z0-9][A-Z0-9-]{1,39}$/.test(profile.roll_number)
    && Number.isInteger(profile.academic_year) && profile.academic_year >= 1 && profile.academic_year <= 8
    && typeof profile.mobile_number === "string" && /^\+?[0-9]{10,15}$/.test(profile.mobile_number);
}

export type EventStatus = "draft" | "published" | "closed" | "completed" | "cancelled";

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  poster_url: string | null;
  venue: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  capacity: number | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

export interface RegistrationRecord {
  id: string;
  event_id: string;
  user_id: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  event_id: string;
  registration_id: string;
  user_id: string;
  checked_in: boolean;
  checked_by: string;
  checked_at: string;
  correction_reason: string | null;
  corrected_by: string | null;
  corrected_at: string | null;
}

export interface AdminAttendanceItem {
  attendance_id: string;
  registration_id: string;
  user_id: string;
  checked_in: boolean;
  checked_at: string;
  checked_by: string;
  correction_reason: string | null;
  corrected_at: string | null;
}

export interface AnnouncementRecord {
  id: string;
  event_id: string | null;
  title: string;
  body: string;
  link: string | null;
  audience: "all_students" | "event_registrants";
  published_by: string;
  published_at: string;
  created_at: string;
}

export interface QrCredentialRecord {
  id: string;
  registration_id: string;
  event_id: string;
  token: string;
  created_at: string;
}

const messages: Record<string, string> = {
  PROFILE_REQUIRED: "Complete your student profile before registering.",
  PROFILE_DETAILS_REQUIRED: "Complete all student details before registering for events.",
  EVENT_NOT_OPEN: "Registration is not open for this event.",
  EVENT_FULL: "This event has reached its capacity.",
  ALREADY_REGISTERED: "You are already registered for this event.",
  ADMIN_REQUIRED: "This action requires an authorized admin account.",
  AUTH_REQUIRED: "Your session has expired. Sign in again.",
  ROLL_NUMBER_IMMUTABLE: "Your claimed roll number cannot be changed here.",
  CAPACITY_BELOW_REGISTRATIONS: "Capacity cannot be reduced below the number of existing registrations.",
  EVENT_NOT_FOUND: "This event is unavailable or you do not have access to it.",
  PUBLISHED_EVENT_CANNOT_RETURN_TO_DRAFT: "An event that has been published cannot return to draft. Close or cancel it instead.",
  EVENT_STATUS_FINAL: "Completed and cancelled events cannot change status.",
  INVALID_EVENT: "The event could not be saved. Check the event fields and try again.",
  INVALID_PROFILE: "Check your student details and enter a mobile number with 10–15 digits, optionally starting with +.",
  INVALID_MOBILE_NUMBER: "Enter a mobile number with 10–15 digits, optionally starting with +.",
  ACCOUNT_NOT_FOUND: "No confirmed account was found for that email address. Ask the person to sign in first.",
  SELF_REVOKE_NOT_ALLOWED: "Ask another admin to remove your access. You cannot revoke your own admin access.",
  INVALID_ADMIN_EMAIL: "Enter a valid email address for this admin account.",
  ADMIN_REASON_REQUIRED: "Enter a reason for this access change.",
  ATTENDANCE_CORRECTION_REQUIRED: "Attendance was manually corrected. Use an audited correction to restore it.",
  INVALID_ATTENDANCE_STATUS: "Choose present or absent for the correction.",
  NOT_REGISTERED: "You must be registered for this event to view attendance credentials.",
  INVALID_QR: "Invalid QR code format. Please present a valid event QR code.",
  QR_NOT_FOUND: "QR code not recognized or no registration found.",
  WRONG_EVENT: "This QR code belongs to a different event.",
  OUTSIDE_CHECK_IN_WINDOW: "Check-in is only available while the event is actively running.",
  ALREADY_CHECKED_IN: "This student is already checked in for this event.",
  CORRECTION_REASON_REQUIRED: "A reason between 3 and 500 characters is required for attendance correction.",
  ATTENDANCE_NOT_FOUND: "Attendance record not found.",
  EVENT_REQUIRED_FOR_AUDIENCE: "Please select an event when targeting event registrants.",
  INVALID_AUDIENCE: "Audience must be either all students or event registrants.",
};

export function workflowError(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "The request failed. Please try again.";
  for (const [code, text] of Object.entries(messages)) if (message.includes(code)) return text;
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "23505" && message.includes("roll_number")) return "That roll number is already claimed by another account.";
    if (error.code === "23514") return message.includes("events")
      ? "Check the field values and date order. Registration must close after it opens; the event must end after it starts. Poster links must use HTTPS."
      : "Check your student details. Registration numbers must contain 2–40 letters, numbers or hyphens; academic year must be 1–8 and mobile numbers must contain 10–15 digits.";
  }
  if (/jwt expired|invalid jwt|session.*expired/i.test(message)) return "Your session has expired. Sign in again.";
  return message;
}

export async function readEvents(client: SupabaseClient, cacheEnabled: boolean, eventId?: string, offset = 0): Promise<EventRecord[]> {
  if (cacheEnabled) {
    const result = await client.functions.invoke("events-read", { body: eventId ? { event_id: eventId } : { limit: 100, offset } });
    if (!result.error && result.data && Array.isArray(result.data.events)) return result.data.events as EventRecord[];
    // A missing/unavailable optional cache must not prevent RLS-protected reads.
    // Authentication remains enforced by the database on the fallback path.
  }
  let query = client.from("events").select("*").order("starts_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 99);
  if (eventId) query = query.eq("id", eventId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EventRecord[];
}
