import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

interface Account { id: string; email: string; password: string }
const fixture = JSON.parse(process.env.LAUNCHPAD_LIVE_FIXTURE ?? "null") as { accounts: Record<string, Account>; eventTitle: string } | null;
if (!fixture) throw new Error("Use npm run test:live to create and clean up development fixtures.");
const { accounts, eventTitle } = fixture;
const url = process.env.NEXT_PUBLIC_MAIN_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY!;

test("admin previews personalized email, queues exactly one campaign and sees progress; students denied", async ({ page }) => {
  test.setTimeout(150000);
  const clients = Object.fromEntries(Object.entries(accounts).map(([role]) => [role, createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
  })]));
  for (const [role, account] of Object.entries(accounts)) {
    expect((await clients[role].auth.signInWithPassword({ email: account.email, password: account.password })).error).toBeNull();
  }
  const hours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
  const event = await clients.admin.rpc("admin_save_event", { p_event: {
    title: `${eventTitle} email`, description: "Synthetic email fixture; no SMTP used.", venue: "Test hall",
    starts_at: hours(24), ends_at: hours(25), registration_opens_at: hours(-1), registration_closes_at: hours(12), status: "published",
  } });
  expect(event.error).toBeNull();
  // The other student's complete profile is part of the shared fixture.
  expect((await clients.other.rpc("register_for_event", { p_event_id: event.data.id })).error).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5184/account");
  await page.getByLabel("Email", { exact: true }).fill(accounts.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(accounts.admin.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible({ timeout: 30000 });
  await page.goto("http://127.0.0.1:5184/announcements");
  const title = `${eventTitle} email notice`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Message", { exact: true }).fill("Selected participants will receive email separately.");
  await page.getByLabel("Audience", { exact: true }).selectOption("event_registrants");
  await page.getByLabel("Event", { exact: true }).selectOption(event.data.id);
  await page.getByLabel("Link URL", { exact: true }).fill("https://drive.google.com/example");
  await page.getByRole("button", { name: "Publish announcement", exact: true }).click();
  await expect(page.getByText("Announcement published to the dashboard. Email was not sent.", { exact: true })).toBeVisible();
  const notice = await clients.admin.from("announcements").select("id").eq("title", title).single();
  expect(notice.error).toBeNull();
  const noticeId = notice.data!.id as string;
  await page.getByLabel("Announcement to email").selectOption(noticeId);
  await page.getByLabel("Email subject", { exact: true }).fill("Hello {name}");
  await page.getByLabel("Email message", { exact: true }).fill("Hello {name}, selected for {event_name}. {link}");
  await expect(page.getByRole("button", { name: "Send individual emails", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Preview email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hello Integration admin", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email preview")).toContainText(`${eventTitle} email`);
  await page.getByRole("button", { name: "Send individual emails", exact: true }).click();
  await expect(page.getByText("Emails queued. The background worker sends them individually in batches of 10. You can leave this page.")).toBeVisible();
  await expect(page.getByText("0 of 1 accepted by Gmail · 1 queued · 0 failed · 0 uncertain · 0 skipped")).toBeVisible();
  // Actual concurrent HTTP RPCs verify idempotency after a response is lost or retried.
  const queue = () => clients.admin.rpc("admin_queue_announcement_email", { p_announcement_id: noticeId, p_subject: "Hello {name}", p_body: "Hello {name}, selected for {event_name}. {link}" });
  const results = await Promise.all(Array.from({ length: 6 }, queue));
  expect(results.every((r) => !r.error)).toBe(true);
  expect(new Set(results.map((r) => r.data)).size).toBe(1);
  const progress = await clients.admin.rpc("admin_email_progress", { p_announcement_ids: [noticeId] });
  expect(progress.error).toBeNull();
  expect(progress.data.campaigns[0].total).toBe(1);
  expect((await clients.student.rpc("admin_email_progress", { p_announcement_ids: [noticeId] })).error?.message).toContain("ADMIN_REQUIRED");
  expect((await clients.student.rpc("admin_queue_announcement_email", { p_announcement_id: noticeId, p_subject: "Hello", p_body: "No" })).error?.message).toContain("ADMIN_REQUIRED");
  expect((await clients.student.from("email_jobs").select("recipient")).error).not.toBeNull();
  expect((await clients.admin.rpc("email_worker_batch", { p_token: crypto.randomUUID() })).error).not.toBeNull();
  await page.reload();
  await expect(page.getByText("0 of 1 accepted by Gmail · 1 queued · 0 failed · 0 uncertain · 0 skipped")).toBeVisible();
  await page.getByRole("button", { name: "Review recipient status", exact: true }).click();
  await expect(page.getByText(accounts.other.email, { exact: false })).toBeVisible();
  expect((await clients.student.rpc("admin_email_job_status", { p_campaign_id: progress.data.campaigns[0].id })).error?.message).toContain("ADMIN_REQUIRED");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const raceNotice = await clients.admin.rpc("admin_publish_announcement", {
    p_title: `${eventTitle} concurrent initial queue`, p_body: "Queue race fixture.", p_audience: "event_registrants", p_event_id: event.data.id,
  });
  expect(raceNotice.error).toBeNull();
  const initialRace = await Promise.all(Array.from({ length: 6 }, () => clients.admin.rpc("admin_queue_announcement_email", {
    p_announcement_id: raceNotice.data.id, p_subject: "Hi {name}", p_body: "Race fixture",
  })));
  expect(initialRace.every((r) => !r.error)).toBe(true);
  expect(new Set(initialRace.map((r) => r.data)).size).toBe(1);
  const raceProgress = await clients.admin.rpc("admin_email_progress", { p_announcement_ids: [raceNotice.data.id] });
  expect(raceProgress.error).toBeNull();
  expect(raceProgress.data.campaigns).toHaveLength(1);
  expect(raceProgress.data.campaigns[0].total).toBe(1);
  // No worker is started and no SMTP send is invoked by this browser test.
});
