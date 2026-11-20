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
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

function datetime(offsetHours: number) {
  const value = new Date(Date.now() + offsetHours * 3_600_000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

test("real admin publishes, student registers, and unauthorized direct requests fail", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const studentPage = await studentContext.newPage();
  const clients = Object.fromEntries(Object.entries(accounts).map(([role]) => [role, createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })]));
  try {
    for (const [role, account] of Object.entries(accounts)) {
      const { error } = await clients[role].auth.signInWithPassword({ email: account.email, password: account.password });
      expect(error?.message, `${role} test account can authenticate`).toBeUndefined();
    }
    const anonymous = createClient(url, key, { auth: { persistSession: false } });
    const anonymousRead = await anonymous.functions.invoke("events-read", { timeout: 15_000, body: {} });
    expect(anonymousRead.error).not.toBeNull();
    expect([401, 403]).toContain(anonymousRead.response?.status);
    await login(adminPage, adminOrigin, accounts.admin);
    await adminPage.goto(`${adminOrigin}/events/new`);
    await adminPage.getByLabel("Title", { exact: true }).fill(eventTitle);
    await adminPage.getByLabel("Description", { exact: true }).fill("A real end-to-end integration fixture; removed after the test.");
    await adminPage.getByLabel("Venue", { exact: true }).fill("Integration lab");
    await adminPage.getByLabel("Starts at", { exact: true }).fill(datetime(48));
    await adminPage.getByLabel("Ends at", { exact: true }).fill(datetime(50));
    await adminPage.getByLabel("Registration opens", { exact: true }).fill(datetime(-2));
    await adminPage.getByLabel("Registration closes", { exact: true }).fill(datetime(24));
    await adminPage.getByLabel("Capacity", { exact: true }).fill("1");
    await adminPage.getByLabel("Status", { exact: true }).selectOption("draft");
    await adminPage.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(adminPage.getByText(eventTitle, { exact: true })).toBeVisible();

    const { data: event, error: eventError } = await clients.admin.from("events").select("*").eq("title", eventTitle).single();
    expect(eventError).toBeNull();
    expect(event.status).toBe("draft");
    const draftRead = await clients.student.from("events").select("id").eq("id", event.id);
    expect(draftRead.error).toBeNull();
    expect(draftRead.data).toEqual([]);
    const draftFunctionRead = await clients.student.functions.invoke("events-read", { timeout: 15_000, body: { event_id: event.id } });
    expect(draftFunctionRead.error).toBeNull();
    expect(draftFunctionRead.data.events).toEqual([]);

    const illicitWrite = await clients.student.rpc("admin_save_event", { p_event: { ...event, status: "published" } });
    expect(illicitWrite.error?.message).toContain("ADMIN_REQUIRED");
    const directWrite = await clients.student.from("events").update({ status: "published" }).eq("id", event.id);
    expect(directWrite.error).not.toBeNull();
    const privateProfile = await clients.student.from("profiles").select("user_id").eq("user_id", accounts.other.id);
    expect(privateProfile.error).toBeNull();
    expect(privateProfile.data).toEqual([]);

    await adminPage.goto(`${adminOrigin}/events/${event.id}/edit`);
    await expect(adminPage.getByLabel("Title", { exact: true })).toHaveValue(eventTitle);
    await adminPage.getByLabel("Status", { exact: true }).selectOption("published");
    await adminPage.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(adminPage.getByText(eventTitle, { exact: true })).toBeVisible();

    const publishedFunctionRead = await clients.student.functions.invoke("events-read", { timeout: 15_000, body: { event_id: event.id } });
    expect(publishedFunctionRead.error).toBeNull();
    expect(publishedFunctionRead.data.events[0].title).toBe(eventTitle);
    const unverified = await clients.unverified.rpc("register_for_event", { p_event_id: event.id });
    expect(unverified.error?.message).toContain("PROFILE_DETAILS_REQUIRED");
    await login(studentPage, studentOrigin, accounts.student);
    await studentPage.setViewportSize({ width: 390, height: 844 });
    await studentPage.goto(`${studentOrigin}/profile`);
    await studentPage.getByLabel("Full name", { exact: true }).fill("Integration student updated");
    await studentPage.getByLabel("Course", { exact: true }).fill("B.Tech");
    await studentPage.getByLabel("Branch", { exact: true }).fill("Computer Science");
    await studentPage.getByLabel("Section", { exact: true }).fill("A");
    await studentPage.getByLabel("Mobile number", { exact: true }).fill("+91 98765 43210");
    await studentPage.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(studentPage.getByText("Profile saved.", { exact: true })).toBeVisible();
    const savedProfile = await clients.student.from("profiles").select("full_name,verification_status").single();
    expect(savedProfile.data).toMatchObject({ full_name: "Integration student updated", verification_status: "unverified" });
    expect((await clients.student.rpc("is_admin")).data).toBe(false);
    await studentPage.goto(`${studentOrigin}/events`);
    await studentPage.getByRole("link", { name: eventTitle, exact: true }).click();
    await studentPage.getByRole("button", { name: "Register for event", exact: true }).click();
    await expect(studentPage.getByText(/registration confirmed|you are registered|already registered/i).first()).toBeVisible();
    await studentPage.goto(`${studentOrigin}/my-events`);
    await expect(studentPage.getByRole("link", { name: eventTitle, exact: true })).toBeVisible();

    const duplicate = await clients.student.rpc("register_for_event", { p_event_id: event.id });
    expect(duplicate.error?.message).toContain("ALREADY_REGISTERED");
    const full = await clients.other.rpc("register_for_event", { p_event_id: event.id });
    expect(full.error?.message).toContain("EVENT_FULL");
    const otherRegistrations = await clients.other.from("registrations").select("id").eq("event_id", event.id);
    expect(otherRegistrations.data).toEqual([]);
    const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const otherPage = await otherContext.newPage();
      await login(otherPage, studentOrigin, accounts.other);
      await otherPage.goto(`${studentOrigin}/events/${event.id}`);
      await otherPage.getByRole("button", { name: "Register for event", exact: true }).click();
      await expect(otherPage.getByRole("main").getByRole("alert")).toContainText("This event has reached its capacity.");
      await login(otherPage, adminOrigin, accounts.other);
      await otherPage.goto(`${adminOrigin}/events`);
      await expect(otherPage.getByRole("heading", { name: "Admin access required", exact: true })).toBeVisible();
      const illicitRoleChange = await clients.other.rpc("admin_set_access", { p_email: accounts.other.email, p_active: true, p_reason: "Attempt self promotion" });
      expect(illicitRoleChange.error?.message).toContain("ADMIN_REQUIRED");
      await adminPage.goto(`${adminOrigin}/admins`);
      await adminPage.getByLabel("Account email", { exact: true }).fill(accounts.other.email);
      await adminPage.getByLabel("Reason", { exact: true }).fill("Integration role grant");
      await adminPage.getByRole("button", { name: "Save admin access", exact: true }).click();
      await expect(adminPage.getByText("Admin access granted.", { exact: true })).toBeVisible();
      expect((await clients.other.rpc("is_admin")).data).toBe(true);
      await otherPage.goto(`${adminOrigin}/admins`);
      await expect(otherPage.getByRole("heading", { name: "Admin access", exact: true })).toBeVisible();
      const selfRevoke = await clients.other.rpc("admin_set_access", { p_email: accounts.other.email, p_active: false, p_reason: "Attempt self revocation" });
      expect(selfRevoke.error?.message).toContain("SELF_REVOKE_NOT_ALLOWED");
      await adminPage.getByLabel("Action", { exact: true }).selectOption("revoke");
      await adminPage.getByLabel("Reason", { exact: true }).fill("Integration role revoke");
      await adminPage.getByRole("button", { name: "Save admin access", exact: true }).click();
      await expect(adminPage.getByText("Admin access revoked.", { exact: true })).toBeVisible();
      expect((await clients.other.rpc("sync_admin_access")).data).toBe(false);
      const revokedDirectory = await clients.other.rpc("admin_list_access");
      expect(revokedDirectory.error?.message).toContain("ADMIN_REQUIRED");
      await otherPage.reload();
      await expect(otherPage.getByRole("heading", { name: "Admin access required", exact: true })).toBeVisible();
    } finally {
      await otherContext.close();
    }
    await adminPage.goto(`${adminOrigin}/events/${event.id}/participants`);
    await expect(adminPage.getByText("Integration student updated", { exact: true })).toBeVisible();
    await adminPage.goto(`${adminOrigin}/events/${event.id}/edit`);
    await adminPage.getByLabel("Status", { exact: true }).selectOption("closed");
    await adminPage.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(adminPage.getByText(eventTitle, { exact: true })).toBeVisible();
    const closed = await clients.other.rpc("register_for_event", { p_event_id: event.id });
    expect(closed.error?.message).toContain("EVENT_NOT_OPEN");
    const closedFunctionRead = await clients.student.functions.invoke("events-read", { timeout: 15_000, body: { event_id: event.id } });
    expect(closedFunctionRead.error).toBeNull();
    expect(closedFunctionRead.data.events[0].status).toBe("closed");
    await studentPage.goto(`${studentOrigin}/account`);
    await studentPage.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(studentPage.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await studentPage.goto(`${studentOrigin}/my-events`);
    await expect(studentPage.getByRole("heading", { name: "Sign in required", exact: true })).toBeVisible();
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));
    await adminContext.close();
    await studentContext.close();
  }
});
