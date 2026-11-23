# Implementation Plan: Announcement Toasts & Modal Preview

**Date:** 2026-11-23  
**Spec Reference:** `docs/superpowers/specs/2026-11-23-announcement-toast-modal-design.md`  
**Goal:** Integrate Rare UI Toast, an in-place announcement preview modal, and a database-load-protected Supabase Realtime announcement notifier for the Launchpad student app.

---

## Proposed Changes

### 1. `apps/student/src/components/ui/toast.tsx` & Layout Mounting
- Verify Rare UI Toast (`Toaster`, `toast`).
- Mount `<Toaster position="bottom-right" />` in `apps/student/src/app/layout.tsx`.

### 2. `apps/student/src/components/announcement-modal.tsx`
- Implement an accessible modal dialog:
  - Header: Eyebrow badge ("Club-wide Announcement" / "Event Update"), close button (`X`).
  - Content: Title, formatted date (`Asia/Kolkata`), body text.
  - Footer actions: "View Event" link (if `event_id`), "Open Resource" external link (if `link_url`), and "Close".
  - Keyboard accessibility (`Escape` key closes), backdrop click closes.

### 3. `apps/student/src/features/announcement-notifier.tsx`
- Implement `AnnouncementNotifier` component:
  - Reads session and client from `useIdentity()`.
  - **Zero-query Realtime broadcast:** Receives `payload.new` via `client.channel("realtime:announcements").on("postgres_changes", ...)`. If `audience === "all_students"`, immediately triggers toast with no database query.
  - **Jitter-delayed event checks:** If `audience === "event_registrants"`, computes a randomized jitter between 1,500ms and 4,000ms before querying `registrations` to verify student enrollment.
  - **Delayed "New on Open" check:** Delays 2,000ms after mount, queries latest announcement, and toasts if `id` is not in `localStorage["launchpad_last_seen_announcement_id"]`.
  - When toast action "Read" or toast body is clicked, sets `activeAnnouncement` which renders `AnnouncementModal`.
  - Writes to `localStorage` when an announcement is toasted or viewed.

### 4. `apps/student/src/app/layout.tsx`
- Wrap `AnnouncementNotifier` in the layout so it is available across all student routes.

### 5. Verification & Tests
- Add tests in `apps/student/src/features/announcement-notifier.test.ts` (or vitest).
- Run `npm run check` (typecheck, lint, test, build).

---

## Tasks

### Task 1: Verify Rare UI Toast & Mount `<Toaster />`
1. Check `apps/student/src/components/ui/toast.tsx` exports `Toaster` and `toast`.
2. Clean up `apps/student/src/lib/utils.ts` to re-export `cn` from `@launchpad/ui`.
3. Add `<Toaster position="bottom-right" />` to `apps/student/src/app/layout.tsx`.
4. Verify student app typecheck passes.

### Task 2: Build `AnnouncementModal` Component
1. Create `apps/student/src/components/announcement-modal.tsx`.
2. Add modal styling in `apps/student/src/student-redesign.css` or component-level styles.
3. Handle `Escape` key, backdrop dismissal, focus trap, and responsive mobile layout.

### Task 3: Build `AnnouncementNotifier` with Load Protection
1. Create `apps/student/src/features/announcement-notifier.tsx`.
2. Implement payload extraction, randomized jitter delay, localStorage caching, and Supabase channel subscription.
3. Wire the "Read" action to trigger `AnnouncementModal`.

### Task 4: Mount Notifier in Student Layout
1. Import `AnnouncementNotifier` into `apps/student/src/app/layout.tsx`.
2. Ensure it only activates for authenticated users.

### Task 5: Testing & Verification
1. Add test suite covering jitter generation, payload handling, and audience filtering.
2. Run full monorepo `npm run check`.
