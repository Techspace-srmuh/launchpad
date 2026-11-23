# Design Specification: Real-time Announcement Toasts & In-Place Modal Preview

**Date:** 2026-11-23  
**Status:** Approved  
**Target:** Launchpad Student App (`apps/student`)

---

## 1. Goal

When club announcements are published from Launchpad Control, students using the Launchpad Student Web App (`apps/student`) receive immediate, animated notifications via **Rare UI Toast** (`swamimalode07/rare-ui/toast`), followed by an in-place modal preview upon clicking the notification so they can read the announcement without losing their active page context.

The system incorporates **database load protection** (WebSocket payload extraction, staggered jitter for targeted announcements, and delayed initial checks) to ensure Supabase database resources are never overwhelmed when announcements are sent to large student cohorts.

---

## 2. Architecture & Components

### 2.1 Rare UI Toast Component
- **Package / Registry Source:** `npx shadcn@latest add swamimalode07/rare-ui/toast`
- **Location:** `apps/student/src/components/ui/toast.tsx`
- **Dependencies:** `motion` (already in `apps/student`), `lucide-react`, `clsx`, `tailwind-merge`
- **Root Mount:** `<Toaster position="bottom-right" />` mounted within `apps/student/src/app/layout.tsx`.

### 2.2 Announcement Modal Component (`AnnouncementModal`)
- **Location:** `apps/student/src/components/announcement-modal.tsx`
- **Behavior:**
  - In-place modal dialog with accessible ARIA attributes (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="announcement-modal-title"`).
  - Shows:
    - Audience tag ("Club-wide Announcement" or "Event Update")
    - Announcement title & published time formatted in `Asia/Kolkata`
    - Announcement body
    - Optional actions: "View Event" (when `event_id` is present) and "Open Resource" (when `link_url` is present)
    - "Close" button, background backdrop click to dismiss, and `Escape` key support.

### 2.3 Announcement Notification Provider (`AnnouncementNotifier`)
- **Location:** `apps/student/src/features/announcement-notifier.tsx`
- **Role:** Mounts once at layout level when a student is signed in.
- **State:**
  - `activeModalAnnouncement: Announcement | null`
  - `lastSeenId: string | null` (hydrated from `localStorage["launchpad_last_seen_announcement_id"]`)

---

## 3. Database Load Protection & Delivery Strategy

To avoid a "thundering herd" query spike across dozens or hundreds of concurrent student clients:

1. **Direct Payload Extraction (Zero Database Query):**
   - Supabase Realtime delivers `payload.new` with the full announcement record (`id`, `title`, `body`, `audience`, `link_url`, `event_id`, `published_at`).
   - For `audience === "all_students"`, the client presents the toast directly using `payload.new`. **0 database queries are performed.**

2. **Staggered Jitter Delay for Event Announcements:**
   - If `audience === "event_registrants"`, the app verifies whether the student is registered for `event_id`.
   - To prevent all connected phones from querying Supabase concurrently, the client introduces a **randomized jitter delay between 1,500ms and 4,000ms** before making the verification query.

3. **Smooth "New on Open" Check:**
   - On initial page load / app mount, the check is delayed by **2,000ms** after mount.
   - Queries only the most recent visible announcement (`limit(1)`).
   - If `announcement.id === localStorage.getItem("launchpad_last_seen_announcement_id")`, no toast is displayed.
   - When toasted or viewed, the ID is recorded in `localStorage`.

---

## 4. Interaction Flow

1. Admin publishes an announcement in Launchpad Control.
2. Supabase Realtime fires the `INSERT` event on `public.announcements`.
3. Student App receives the event:
   - If `all_students`: Immediately triggers Rare UI `toast("New Announcement", { description: title, action: { label: "Read", onClick: () => openModal(announcement) } })`.
   - If `event_registrants`: Waits random jitter (1.5s - 4.0s), checks registration via Supabase client, and triggers toast if registered.
4. Student clicks "Read" or clicks the toast body:
   - In-place `AnnouncementModal` opens.
   - Student reads details and can navigate to the event or linked resources without losing scroll state.

---

## 5. Verification Plan

1. **Unit / Integration Tests:**
   - Verify jitter calculation produces values in [1500, 4000].
   - Verify `localStorage` state updates and prevents duplicate toasts.
   - Verify modal renders correct title, body, event link, and resource link.
2. **Build and Typecheck:**
   - Run `npm run check` across the entire monorepo to ensure zero build, type, or lint errors.
3. **Live / Dev Verification:**
   - Test publishing an announcement in admin or running dev server to verify toast animation and modal responsiveness.
