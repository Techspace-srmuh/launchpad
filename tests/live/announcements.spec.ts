import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

interface Account { id: string; email: string; password: string }
interface Fixture {
  accounts: Record<"admin" | "student" | "other" | "unverified", Account>;
  eventTitle: string;
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

test("dashboard notices enforce audience isolation and share one OD link without sending email", async ({ browser }) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext(),
  ]);
  const [adminPage, studentPage, otherPage] = await Promise.all(contexts.map((context) => context.newPage()));
  const diagnostics = { pageErrors: 0, consoleErrors: 0, failedRequests: 0, serverErrors: 0 };
  for (const page of [adminPage, studentPage, otherPage]) {
    // Counts only: never retain console text, URLs, request bodies or credentials.
    page.on("pageerror", () => { diagnostics.pageErrors += 1; });
    page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors += 1; });
    page.on("requestfailed", () => { diagnostics.failedRequests += 1; });
    page.on("response", (response) => { if (response.status() >= 500) diagnostics.serverErrors += 1; });
  }
  const clients = Object.fromEntries(Object.keys(accounts).map((role) => [role, createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })]));
  const allTitle = `${eventTitle} all-student notice`;
  const targetTitle = `${eventTitle} shared OD`;
  const eventName = `${eventTitle} announcement audience`;
  // Synthetic external reference; assert the URL without opening or downloading it.
  const driveUrl = "https://drive.google.com/file/d/launchpad-synthetic-signed-od/view";
  try {
    for (const [role, account] of Object.entries(accounts)) {
      const result = await clients[role].auth.signInWithPassword({ email: account.email, password: account.password });
      expect(result.error?.message, `${role} test account can authenticate`).toBeUndefined();
    }
    const profile = await clients.student.from("profiles").select("*").single();
    expect(profile.error).toBeNull();
    const completeProfile = await clients.student.rpc("save_profile", {
      p_full_name: profile.data.full_name, p_roll_number: profile.data.roll_number,
      p_department: profile.data.department, p_academic_year: profile.data.academic_year,
      p_course: "B.Tech", p_branch: "Computer Science", p_section: "A", p_mobile_number: "9876543210",
    });
    expect(completeProfile.error).toBeNull();
    const date = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
    const savedEvent = await clients.admin.rpc("admin_save_event", { p_event: {
      title: eventName, description: "Temporary audience-isolation fixture.", venue: "Integration lab",
      starts_at: date(48), ends_at: date(50), registration_opens_at: date(-2),
      registration_closes_at: date(24), capacity: 5, status: "published",
    } });
    expect(savedEvent.error).toBeNull();
    const eventId = savedEvent.data.id as string;
    expect((await clients.student.rpc("register_for_event", { p_event_id: eventId })).error).toBeNull();

    await login(adminPage, adminOrigin, accounts.admin);
    await adminPage.goto(`${adminOrigin}/announcements`);
    const compose = adminPage.getByRole("main");
    await compose.getByLabel("Title", { exact: true }).fill(allTitle);
    await compose.getByLabel("Message", { exact: true }).fill("A custom dashboard notice for every student.");
    await compose.getByLabel("Audience", { exact: true }).selectOption("all_students");
    await compose.getByRole("button", { name: "Publish announcement", exact: true }).click();
    await expect(compose.getByText("Announcement published to the dashboard. Email was not sent.", { exact: true })).toBeVisible();
    await expect(compose.getByRole("heading", { name: allTitle, exact: true })).toBeVisible();

    await compose.getByLabel("Title", { exact: true }).fill(targetTitle);
    await compose.getByLabel("Message", { exact: true }).fill("The common signed OD is available through this shared Drive PDF link.");
    await compose.getByLabel("Audience", { exact: true }).selectOption("event_registrants");
    await compose.getByLabel("Event", { exact: true }).selectOption(eventId);
    await compose.getByLabel("Link URL", { exact: true }).fill(driveUrl);
    await compose.getByRole("button", { name: "Publish announcement", exact: true }).click();
    await expect(compose.getByRole("heading", { name: targetTitle, exact: true })).toBeVisible();
    await expect(compose.getByText("Announcement published to the dashboard. Email was not sent.", { exact: true })).toBeVisible();

    // HTTP satisfies the browser's URL input, so the rejection exercises the real backend.
    const rejectedTitle = `${eventTitle} rejected HTTP link`;
    await compose.getByLabel("Title", { exact: true }).fill(rejectedTitle);
    await compose.getByLabel("Message", { exact: true }).fill("This invalid link must not create a dashboard record.");
    await compose.getByLabel("Link URL", { exact: true }).fill("http://drive.google.com/file/d/invalid/view");
    await compose.getByRole("button", { name: "Publish announcement", exact: true }).click();
    await expect(compose.getByRole("alert")).toHaveText("Enter a valid HTTPS link without credentials, spaces or backslashes.");
    const rejectedRecord = await clients.admin.from("announcements").select("id").eq("title", rejectedTitle);
    expect(rejectedRecord.error).toBeNull();
    expect(rejectedRecord.data).toEqual([]);

    await login(studentPage, studentOrigin, accounts.student);
    await studentPage.goto(`${studentOrigin}/announcements`);
    const studentMain = studentPage.getByRole("main");
    await expect(studentMain.getByRole("heading", { name: allTitle, exact: true })).toBeVisible();
    await expect(studentMain.getByRole("heading", { name: targetTitle, exact: true })).toBeVisible();
    const odNotice = studentMain.getByRole("article").filter({ has: studentPage.getByRole("heading", { name: targetTitle, exact: true }) });
    await expect(odNotice.getByRole("link", { name: "Open linked resource", exact: true })).toHaveAttribute("href", driveUrl);
    await expect(odNotice.getByRole("link", { name: "View event", exact: true })).toHaveAttribute("href", `/events/${eventId}`);
    await expect(studentMain.locator(`a[href="${driveUrl}"]`)).toHaveCount(1);

    const stored = await clients.admin.from("announcements").select("id,title,body,audience,event_id,link_url,published_by")
      .eq("published_by", accounts.admin.id).in("title", [allTitle, targetTitle]);
    expect(stored.error).toBeNull();
    expect(stored.data).toHaveLength(2);
    const target = stored.data!.find((row) => row.title === targetTitle)!;
    expect(target).toMatchObject({ audience: "event_registrants", event_id: eventId, link_url: driveUrl });
    const intendedRead = await clients.student.from("announcements").select("id,link_url").eq("id", target.id);
    expect(intendedRead.error).toBeNull();
    expect(intendedRead.data).toEqual([{ id: target.id, link_url: driveUrl }]);
    const excludedRead = await clients.other.from("announcements").select("id").eq("id", target.id);
    expect(excludedRead.error).toBeNull();
    expect(excludedRead.data).toEqual([]);
    await login(otherPage, studentOrigin, accounts.other);
    await otherPage.goto(`${studentOrigin}/announcements`);
    await expect(otherPage.getByRole("main").getByRole("heading", { name: allTitle, exact: true })).toBeVisible();
    await expect(otherPage.getByRole("main").getByRole("heading", { name: targetTitle, exact: true })).toHaveCount(0);

    const publishArgs = { p_title: `${eventTitle} forbidden`, p_body: "Must not publish", p_audience: "all_students" };
    const anonymous = createClient(url, key, { auth: { persistSession: false } });
    expect((await anonymous.rpc("admin_publish_announcement", publishArgs)).error).not.toBeNull();
    expect((await anonymous.from("announcements").select("id").eq("id", target.id)).error).not.toBeNull();
    const studentPublish = await clients.student.rpc("admin_publish_announcement", publishArgs);
    expect(studentPublish.error?.message).toContain("ADMIN_REQUIRED");
    for (const client of [clients.admin, clients.student]) {
      const directInsert = await client.from("announcements").insert({
        title: publishArgs.p_title, body: publishArgs.p_body, audience: "all_students", published_by: accounts.admin.id,
      });
      expect(directInsert.error).not.toBeNull();
      expect((await client.from("announcements").update({ body: "Unauthorized replacement" }).eq("id", target.id)).error).not.toBeNull();
      expect((await client.from("announcements").delete().eq("id", target.id)).error).not.toBeNull();
    }
    const invalidUrl = await clients.admin.rpc("admin_publish_announcement", { ...publishArgs, p_link_url: "javascript:alert(1)" });
    expect(invalidUrl.error?.message).toContain("INVALID_ANNOUNCEMENT_LINK");
    await login(otherPage, adminOrigin, accounts.other);
    await otherPage.goto(`${adminOrigin}/announcements`);
    await expect(otherPage.getByRole("heading", { name: "Admin access required", exact: true })).toBeVisible();
    await studentPage.goto(`${studentOrigin}/account`);
    await studentPage.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(studentPage.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
    await studentPage.goto(`${studentOrigin}/announcements`);
    await expect(studentPage.getByRole("heading", { name: "Sign in required", exact: true })).toBeVisible();
    expect(diagnostics.pageErrors).toBe(0);
    expect(diagnostics.serverErrors).toBe(0);
  } finally {
    await test.info().attach("sanitized-browser-diagnostics", { body: JSON.stringify(diagnostics), contentType: "application/json" });
    await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));
    await Promise.all(contexts.map((context) => context.close()));
  }
});
