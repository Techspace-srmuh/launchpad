import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

interface Account { id: string; email: string; password: string }
interface Fixture {
  accounts: Record<"admin" | "student" | "other" | "unverified", Account>;
  eventTitle: string;
  eventId: string;
}
const fixture = JSON.parse(process.env.LAUNCHPAD_LIVE_FIXTURE ?? "null") as Fixture | null;
if (!fixture) throw new Error("Run live tests through npm run test:live to create and clean up test accounts.");
const { accounts, eventTitle } = fixture;
const url = process.env.NEXT_PUBLIC_MAIN_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY!;
const studentOrigin = "http://127.0.0.1:5183";
const adminOrigin = "http://127.0.0.1:5184";

async function login(page: Page, origin: string, account: Account) {
  await page.goto(`${origin}/account`);
  const emailOption = page.getByRole("button", { name: /Continue with Email/ });
  if (origin === studentOrigin) await emailOption.click();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true }).or(page.getByRole("heading", { name: "Complete your profile", exact: true }))).toBeVisible();
}

function datetime(offsetHours: number) {
  const value = new Date(Date.now() + offsetHours * 3_600_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

test("live dashboards: admin summaries, student activity, audience isolation, and access gates", async ({ browser }) => {
  test.setTimeout(120_000);
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const otherContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();
  const otherPage = await otherContext.newPage();

  const clients = Object.fromEntries(Object.entries(accounts).map(([role]) => [role, createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })]));

  for (const [role, account] of Object.entries(accounts)) {
    const { error } = await clients[role].auth.signInWithPassword({ email: account.email, password: account.password });
    expect(error?.message, `${role} test account can authenticate`).toBeUndefined();
  }

  // 1. Direct RPC protection checks
  const anonymous = createClient(url, key, { auth: { persistSession: false } });
  const anonRpc = await anonymous.rpc("admin_get_dashboard_summary");
  expect(anonRpc.error).not.toBeNull();

  const studentRpc = await clients.student.rpc("admin_get_dashboard_summary");
  expect(studentRpc.error).not.toBeNull();
  expect(studentRpc.error?.message).toContain("ADMIN_REQUIRED");

  // Admin RPC succeeds
  const adminRpc = await clients.admin.rpc("admin_get_dashboard_summary");
  expect(adminRpc.error).toBeNull();
  expect(adminRpc.data).toHaveProperty("total_events");
  expect(adminRpc.data).toHaveProperty("total_registrations");
  expect(adminRpc.data).toHaveProperty("total_check_ins");

  // 2. Admin creates and publishes an event
  await login(adminPage, adminOrigin, accounts.admin);
  await adminPage.goto(`${adminOrigin}/events/new`);
  await adminPage.getByLabel("Title", { exact: true }).fill(eventTitle);
  await adminPage.getByLabel("Description", { exact: true }).fill("Dashboard test event");
  await adminPage.getByLabel("Venue", { exact: true }).fill("TechSpace Arena");
  await adminPage.getByLabel("Starts at", { exact: true }).fill(datetime(-1));
  await adminPage.getByLabel("Ends at", { exact: true }).fill(datetime(5));
  await adminPage.getByLabel("Registration opens", { exact: true }).fill(datetime(-2));
  await adminPage.getByLabel("Registration closes", { exact: true }).fill(datetime(4));
  await adminPage.getByLabel("Capacity", { exact: true }).fill("10");
  await adminPage.getByLabel("Status", { exact: true }).selectOption("published");
  await adminPage.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(adminPage).toHaveURL(`${adminOrigin}/events?saved=1`);

  // Check admin dashboard on Control home page
  await adminPage.goto(adminOrigin);
  await expect(adminPage.getByRole("heading", { level: 1, name: "Operations overview" })).toBeVisible();
  await expect(adminPage.getByText("Total Events", { exact: true })).toBeVisible();
  await expect(adminPage.getByText("Upcoming Events", { exact: true })).toBeVisible();
  await expect(adminPage.getByText("Total Registrations", { exact: true })).toBeVisible();
  await expect(adminPage.getByText("Total Check-ins", { exact: true })).toBeVisible();
  await expect(adminPage.getByText(eventTitle)).toBeVisible();

  // 3. Student logs in to Launchpad and views incomplete profile state
  await login(studentPage, studentOrigin, accounts.student);
  await studentPage.goto(studentOrigin);
  await expect(studentPage.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect(studentPage.getByText("Student profile incomplete")).toBeVisible();

  // Complete profile via UI
  await studentPage.getByRole("link", { name: /Complete profile/ }).click();
  await expect(studentPage).toHaveURL(`${studentOrigin}/profile`);
  await studentPage.getByLabel("Course", { exact: true }).fill("B.Tech");
  await studentPage.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(studentPage.getByRole("status")).toContainText("Profile saved.");

  // Return to student dashboard and verify incomplete alert is gone
  await studentPage.goto(studentOrigin);
  await expect(studentPage.getByText("Student profile incomplete")).toHaveCount(0);

  // Student registers for event
  const { data: eventRows } = await clients.student.from("events").select("id").eq("title", eventTitle);
  const createdEventId = eventRows?.[0]?.id;
  expect(createdEventId).toBeDefined();

  const { error: regErr } = await clients.student.rpc("register_for_event", { p_event_id: createdEventId });
  expect(regErr).toBeNull();

  // Admin checks student in
  const { data: credToken } = await clients.student.rpc("generate_qr_credential", { p_event_id: createdEventId });
  expect(credToken).toBeDefined();
  const { error: checkInErr } = await clients.admin.rpc("validate_check_in", { p_token: credToken, p_event_id: createdEventId });
  expect(checkInErr).toBeNull();

  // 4. Admin publishes targeted announcement for event_registrants
  const noticeTitle = `Notice ${eventTitle}`;
  const { error: annErr } = await clients.admin.rpc("admin_publish_announcement", {
    p_title: noticeTitle,
    p_body: "Important registered student announcement",
    p_audience: "event_registrants",
    p_event_id: createdEventId,
  });
  expect(annErr).toBeNull();

  // 5. Student views updated Student Dashboard with attendance activity
  await studentPage.goto(studentOrigin);
  await expect(studentPage.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect(studentPage.getByRole("heading", { level: 2, name: "Upcoming events" })).toBeVisible();
  await expect(studentPage.getByRole("heading", { level: 2, name: "My event activity" })).toBeVisible();
  await expect(studentPage.getByRole("heading", { level: 2, name: "Recent announcements" })).toBeVisible();

  // Verify registered event and checked-in attendance activity
  await expect(studentPage.getByText(eventTitle).first()).toBeVisible();
  await expect(studentPage.getByText("Checked In", { exact: true })).toBeVisible();

  // Verify targeted announcement is visible to registered student
  await expect(studentPage.getByText(noticeTitle)).toBeVisible();

  // 6. Audience isolation check: other student (not registered) must NOT see the event announcement
  await login(otherPage, studentOrigin, accounts.other);
  await otherPage.goto(studentOrigin);
  await expect(otherPage.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect(otherPage.getByText(noticeTitle)).toHaveCount(0);

  // 7. Non-admin access gate: student signing into adminOrigin is denied admin access
  await login(studentPage, adminOrigin, accounts.student);
  await studentPage.goto(adminOrigin);
  await expect(studentPage.getByRole("heading", { level: 1, name: "Admin access required" })).toBeVisible();

  // 8. Admin dashboard reflects updated counts
  await adminPage.goto(adminOrigin);
  await expect(adminPage.getByText(eventTitle, { exact: true })).toBeVisible();
  await expect(adminPage.getByText("1 present")).toBeVisible();
});
