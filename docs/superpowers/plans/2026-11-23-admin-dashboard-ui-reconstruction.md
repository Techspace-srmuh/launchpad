# TechSpace Launchpad Admin Dashboard UI Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the TechSpace Launchpad Admin Panel to faithfully match the reference design system (modern minimalist white/light SaaS dashboard with charcoal typography and yellow accents) while preserving all data, routes, authentication, authorization, and business logic.

**Architecture:** Refactor the admin app shell (`shell.tsx`) to feature a fixed left navigation sidebar (288px) and top header (80px), update the global styling tokens in `index.css` to light SaaS aesthetics, build modular dashboard components (hero introduction with astronaut doodle, 4 KPI cards, responsive SVG bar chart analytics, quick actions, and recent events management table with actions dropdown), and ensure full backwards compatibility with all Next.js routes and Playwright test assertions.

**Tech Stack:** Next.js App Router (React 19), Tailwind CSS v4, Lucide React icons, TypeScript, `@launchpad/supabase`, `@launchpad/ui`.

## Global Constraints

- Sidebar width: ~288px; top header height: ~80px; main horizontal padding: ~36-40px; large card radius: ~22-24px; control radius: ~12-14px.
- Color tokens: Main bg `#FFFFFF`, Secondary bg `#FAFAFA`, Primary text `#171717`, Secondary text `#666B7A`, Muted text `#858B98`, Border `#E9E9ED`, Yellow accent `#FFD84D`, Soft yellow `#FFF3BD`, Active nav `#1C1C1C`, Success bg `#E5F8E8`, Success text `#198038`, Soft purple `#F0ECFF`, Soft blue `#EAF4FF`.
- Sidebar navigation order: Overview, Events, Registrations, Attendance, Announcements, Admins, Reports, Divider, Settings, Account.
- Active navigation item: `#1C1C1C` background, white icon/text, rounded 12-14px, thin yellow accent on left edge.
- Bottom sidebar admin card: Yellow circular avatar with initial, admin name, "Super Admin" role, chevron right, popover with Profile, Settings, Sign Out.
- Header: Page title on left, rounded search input with `⌘K` badge in center/right, notification bell and admin avatar on far right.
- Hero introduction: `✦ ADMIN DASHBOARD ✦` eyebrow, `Operations Overview` with curved yellow underline under "Overview", subtitle, and astronaut sitting with laptop (`/doodles/08_astronaut_coding_laptop.png`) inside soft-yellow circle with sparkle stars.
- KPI cards: Total Events (yellow), Registrations (lavender), Check-ins (green), Upcoming Events (blue) with real backend data.
- Analytics and Quick Actions row: 62% bar chart with registrations (yellow) and check-ins (lavender), 38% quick actions with 3 stacked styled buttons.
- Recent Events table: Event (yellow tile + bold title), Status badge, Date & Time (with icons), Registrations count/cap, Check-ins green badge, Actions (Edit icon button + 3-dot dropdown menu).
- Preserve existing authentication, role checks, event management, and e2e test selectors (`Main navigation`, `Setup`, `Account`, `Setup needed`, etc.).

---

### Task 1: Design System & Styling Tokens in `index.css`

**Files:**
- Modify: `apps/admin/src/index.css`

- [ ] **Step 1: Update `:root` variables and base styles to the clean white/light SaaS tokens**
  - Set color scheme to light.
  - Set background to `#FAFAFA` and text to `#171717`.
  - Define custom utility classes for shadows, border radii, and soft card backgrounds.
- [ ] **Step 2: Update shared workflow classes for sub-pages**
  - Ensure `.workflow-panel`, `.workflow-form`, `.table-scroll`, inputs, buttons, and alerts look clean and consistent on light backgrounds.
- [ ] **Step 3: Verify styles compile without errors**
  - Run `npm run typecheck`.

---

### Task 2: Left Sidebar & Top Header Reconstruction (`shell.tsx`)

**Files:**
- Modify: `apps/admin/src/components/shell.tsx`

- [ ] **Step 1: Implement Left Sidebar Layout (288px width)**
  - Brand section at top:
    - Rounded yellow square `#FFD84D` with Lucide `Rocket` icon.
    - "TechSpace" in bold `#171717` and "Launchpad Control" in `#666B7A`.
    - Yellow pill: "Admin".
  - Main navigation list with exact requested items and icons:
    - Overview (`House` -> `/`)
    - Events (`CalendarDays` -> `/events`)
    - Registrations (`UsersRound` -> `/events`)
    - Attendance (`CircleCheck` -> `/events`)
    - Announcements (`Megaphone` -> `/announcements`)
    - Admins (`Shield` -> `/admins`)
    - Reports (`ChartNoAxesColumn` -> `/events`)
    - Divider
    - Settings (`Settings` -> `/setup`)
    - Account (`LockKeyhole` or `UserCircle` -> `/account` for test compatibility)
  - Active styling: `#1C1C1C` background, white icon & text, thin yellow left accent bar, rounded-xl.
  - Inactive hover: `#F5F5F7` background, smooth 180ms transition.
- [ ] **Step 2: Implement Bottom Admin Account Card**
  - Anchored at bottom-left of sidebar.
  - Rounded white card, border `#E9E9ED`, shadow-sm.
  - Circular yellow avatar with admin's initial.
  - Admin name (derived from profile/session) and "Super Admin" role.
  - Chevron right icon.
  - Clickable dropdown menu with: My Profile (`/profile`), Account Settings (`/account`), Sign Out (functional).
- [ ] **Step 3: Implement Top Header (80px height)**
  - Sticky top header with `#FFFFFF` background and `#E9E9ED` bottom border.
  - Left: Page title based on route (e.g., "Overview").
  - Center/Right: Rounded search bar with `Search` icon, placeholder `"Search events, users, registrations..."`, and `⌘K` keyboard shortcut badge.
  - Far Right: Notification bell with unread badge (showing announcements dropdown on click) and admin avatar.
  - Mobile responsive drawer toggle.
- [ ] **Step 4: Preserve all route wrappers, SetupNotice, and NotFoundPage**
  - Ensure `role="status"` on `SetupNotice` is preserved for e2e tests.
- [ ] **Step 5: Verify shell compilation**
  - Run `npm run typecheck`.

---

### Task 3: Hero Introduction, 4 KPI Statistic Cards & Quick Actions

**Files:**
- Modify: `apps/admin/src/features/dashboard.tsx`

- [ ] **Step 1: Implement Dashboard Introduction Section**
  - Eyebrow: `✦ ADMIN DASHBOARD ✦`
  - Main title: `Operations Overview` with hand-drawn yellow underline SVG under "Overview".
  - Subtitle: `Manage events, registrations, attendance, and announcements on Launchpad.`
  - Astronaut doodle on right:
    - Image `/doodles/08_astronaut_coding_laptop.png`.
    - Soft-yellow circular background `#FFF3BD` with decorative sparkle stars.
- [ ] **Step 2: Implement 4 KPI Statistic Cards**
  - Grid: 4 columns on desktop (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5`).
  - Card 1: Total Events (CalendarDays icon, soft yellow `#FFF3BD` container, subtle warm-yellow surface highlight, `data.total_events`).
  - Card 2: Registrations (UsersRound icon, soft lavender `#F0ECFF` container, `data.total_registrations`).
  - Card 3: Check-ins (CircleCheck icon, soft green `#E5F8E8` container, `data.total_check_ins`).
  - Card 4: Upcoming Events (CalendarDays icon, soft blue `#EAF4FF` container, `data.upcoming_events`).
  - Rounded-22px, border `#E9E9ED`, shadow-sm, hover elevation.
- [ ] **Step 3: Implement Quick Actions Card (38% width)**
  - Card header: Yellow `Zap` lightning icon + "Quick Actions".
  - Three large stacked buttons:
    1. "Create New Event" (yellow background, dark text, Plus icon, ArrowRight).
    2. "Scan Attendance" (white background, border, QR icon, ArrowRight).
    3. "Export Reports" (white background, border, chart/download icon, ArrowRight).
  - Hover animations with smooth translation.
- [ ] **Step 4: Verify typecheck passes**
  - Run `npm run typecheck`.

---

### Task 4: Analytics Chart & Recent Events Management Table

**Files:**
- Create: `apps/admin/src/features/dashboard-chart.tsx`
- Modify: `apps/admin/src/features/dashboard.tsx`

- [ ] **Step 1: Build the Responsive SVG Bar Chart**
  - Header: `ChartNoAxesColumn` icon + "Registrations & Check-ins" (19px bold).
  - Top-right: "Last 30 days" pill with `ChevronDown`.
  - Legend: Registrations (`#FFD84D`) and Check-ins (`#E0DAFB`).
  - Clean SVG bar chart rendering paired bars per event using `data.events`.
  - Horizontal gridlines, event titles on X-axis, hover tooltips, empty state when no events.
- [ ] **Step 2: Build the Recent Events Management Table**
  - Card container: white, rounded-22px, border `#E9E9ED`, padding 22px.
  - Header: Calendar icon + "Recent Events", Right: "View All →" link to `/events`.
  - Columns: `EVENT`, `STATUS`, `DATE & TIME`, `REGISTRATIONS`, `CHECK-INS`, `ACTIONS`.
  - Table header: Rounded `#F7F7F8` bar with small uppercase `#858B98` text.
  - Table rows:
    - Event: Yellow tile (`#FFF3BD`) + Event title in bold.
    - Status: Soft pill badge (Published `#E5F8E8` / `#198038`, Draft `#F4F4F6`, Cancelled `#FEE2E2`).
    - Date & Time: Line 1 calendar icon + formatted date; Line 2 location pin + venue.
    - Registrations: Registered count / capacity (e.g. `3 / 100`).
    - Check-ins: `X present` in subtle green badge.
    - Actions: Edit pencil button (`/events/${event.id}/edit`), 3-dot overflow menu with View Participants, Scan Attendance, Export Registrations, Manage Materials.
  - Connect search input from header to filter rows in the table.
- [ ] **Step 3: Verify compilation and tests**
  - Run `npm run typecheck`.

---

### Task 5: End-to-End Verification & Quality Assurance

- [ ] **Step 1: Run typecheck across all workspaces**
  - `npm run typecheck`
- [ ] **Step 2: Run unit tests**
  - `npm test`
- [ ] **Step 3: Run Playwright e2e test foundations**
  - `npx playwright test tests/e2e/foundations.spec.ts`
- [ ] **Step 4: Build both apps**
  - `npm run build:admin`
- [ ] **Step 5: Inspect responsive views and final visual polish**
  - Verify desktop (1536x1024), tablet, and mobile views.
