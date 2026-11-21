export {
  readBrowserConfig,
  type BrowserConfig,
  type BrowserConfigResult,
} from "./config";
export { createBrowserClient } from "./client";
export { IdentityProvider } from "./identity";
export { useIdentity } from "./identity-context";
export { renderEmailTemplate, emailTemplateError, type EmailTemplateValues } from "./email-template";
export {
  isProfileComplete,
  readEvents,
  readAdminDashboard,
  readStudentDashboard,
  workflowError,
  type EventRecord,
  type EventStatus,
  type ProfileRecord,
  type RegistrationRecord,
  type AttendanceRecord,
  type AdminAttendanceItem,
  type AnnouncementRecord,
  type AdminDashboardEvent,
  type AdminDashboardAnnouncement,
  type AdminDashboardSummary,
  type StudentRegisteredEvent,
  type StudentDashboardData,
  type QrCredentialRecord,
} from "./workflows";
