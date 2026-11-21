import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

interface Account { id: string; email: string; password: string }
interface Participant { id: string; fullName: string; roll: string; department: string; year: number }
interface Fixture {
  accounts: Record<"admin" | "student" | "revoked", Account>;
  events: Record<"visible" | "draft" | "other", { id: string; title: string }>;
  participants: Participant[];
}
const fixture = JSON.parse(process.env.LAUNCHPAD_MATERIALS_EXPORT_FIXTURE ?? "null") as Fixture | null;
if (!fixture) throw new Error("Use node scripts/test-live-materials-export.mjs to seed and clean synthetic fixtures.");
const { accounts, events, participants } = fixture;
const studentOrigin = process.env.MATERIALS_STUDENT_ORIGIN ?? "http://127.0.0.1:5173";
const adminOrigin = process.env.MATERIALS_ADMIN_ORIGIN ?? "http://127.0.0.1:5174";
const client = () => createClient(process.env.NEXT_PUBLIC_MAIN_SUPABASE_URL!, process.env.NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function authenticated(account: Account) {
  const value = client();
  const result = await value.auth.signInWithPassword({ email: account.email, password: account.password });
  expect(result.error?.message, "Synthetic account authentication").toBeUndefined();
  return value;
}
async function login(page: Page, origin: string, account: Account) {
  await page.goto(`${origin}/account`);
  await page.getByRole("button", { name: /^(Sign in|Sign out|Continue with Email.*)$/ }).first().waitFor({ state: "visible" });
  if (await page.getByRole("button", { name: "Sign out", exact: true }).count()) {
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
  if (origin === studentOrigin) await page.getByRole("button", { name: /Continue with Email/ }).click();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible({ timeout: 30_000 });
}
// RFC 4180 parsing retains embedded commas, double quotes and line breaks.
function csvRows(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const input = value.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\r" || character === "\n") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  expect(quoted, "CSV quotes balanced").toBe(false);
  return rows;
}

test("admin manages ordered links and student/API reads enforce publication and event isolation", async ({ browser }) => {
  const admin = await authenticated(accounts.admin), student = await authenticated(accounts.student), anonymous = client();
  const contexts = await Promise.all([browser.newContext(), browser.newContext({ viewport: { width: 390, height: 844 } })]);
  const [adminPage, studentPage] = await Promise.all(contexts.map((context) => context.newPage()));
  const galleryUrl = "https://photos.app.goo.gl/LaunchpadSyntheticAlbum";
  const resourceUrl = "https://drive.google.com/file/d/launchpad-synthetic-resource/view";
  const args = { p_event_id: events.visible.id, p_kind: "resource", p_label: "API fixture", p_url: resourceUrl, p_published: true, p_display_order: 0 };
  try {
    await login(adminPage, adminOrigin, accounts.admin);
    await adminPage.goto(`${adminOrigin}/events/${events.visible.id}/materials`);
    await expect(adminPage.getByRole("heading", { name: "Gallery & resources", exact: true })).toBeVisible();
    await expect(adminPage.getByText("No gallery or resource links yet.", { exact: true })).toBeVisible();
    const add = async (label: string, kind: string, url: string, order: number, published = true) => {
      await adminPage.getByLabel("Label", { exact: true }).fill(label);
      await adminPage.getByLabel("Kind", { exact: true }).selectOption(kind);
      await adminPage.getByLabel("External HTTPS URL", { exact: true }).fill(url);
      await adminPage.getByLabel("Display order", { exact: true }).fill(String(order));
      await adminPage.getByLabel("Published to students", { exact: true }).setChecked(published);
      await adminPage.getByRole("button", { name: "Add link", exact: true }).click();
      await expect(adminPage.getByRole("link", { name: label, exact: true })).toBeVisible();
    };
    await add("Synthetic gallery", "gallery", galleryUrl, 20);
    await add("Synthetic resource", "resource", resourceUrl, 10);
    await add("Hidden synthetic link", "resource", resourceUrl, 30, false);
    const stored = await admin.from("event_materials").select("id,label").eq("event_id", events.visible.id);
    expect(stored.error).toBeNull();
    const galleryId = stored.data!.find((entry) => entry.label === "Synthetic gallery")!.id;
    const hiddenId = stored.data!.find((entry) => entry.label === "Hidden synthetic link")!.id;
    const row = (label: string) => adminPage.locator("article").filter({ has: adminPage.getByRole("link", { name: label, exact: true }) });
    await row("Synthetic gallery").getByRole("button", { name: "Edit", exact: true }).click();
    await adminPage.getByLabel("Label", { exact: true }).fill("Edited synthetic gallery");
    await adminPage.getByLabel("Display order", { exact: true }).fill("0");
    await adminPage.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(adminPage.getByRole("link", { name: "Edited synthetic gallery", exact: true })).toBeVisible();
    expect((await admin.rpc("admin_save_event_material", { ...args, p_event_id: events.draft.id, p_label: "Draft event secret" })).error).toBeNull();
    expect((await admin.rpc("admin_save_event_material", { ...args, p_event_id: events.other.id, p_label: "Other event only" })).error).toBeNull();
    await login(studentPage, studentOrigin, accounts.student);
    await studentPage.goto(`${studentOrigin}/events/${events.visible.id}/materials`);
    await expect(studentPage.getByRole("link", { name: "Edited synthetic gallery", exact: true })).toHaveAttribute("href", galleryUrl);
    await expect(studentPage.getByRole("link", { name: "Synthetic resource", exact: true })).toHaveAttribute("href", resourceUrl);
    await expect(studentPage.locator("article h3 a")).toHaveText(["Edited synthetic gallery", "Synthetic resource"]);
    for (const label of ["Hidden synthetic link", "Draft event secret", "Other event only"]) await expect(studentPage.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    const visibleRead = await student.from("event_materials").select("label").eq("event_id", events.visible.id).order("display_order");
    expect(visibleRead.error).toBeNull(); expect(visibleRead.data?.map((entry) => entry.label)).toEqual(["Edited synthetic gallery", "Synthetic resource"]);
    for (const read of [
      await student.from("event_materials").select("id").eq("event_id", events.draft.id),
      await student.from("event_materials").select("id").eq("id", hiddenId),
    ]) { expect(read.error).toBeNull(); expect(read.data).toEqual([]); }
    const anonRead = await anonymous.from("event_materials").select("id").eq("event_id", events.visible.id);
    expect(anonRead.error ?? (anonRead.data?.length === 0 ? true : null)).not.toBeNull();
    for (const kind of ["resource", "gallery"]) {
      for (const invalid of ["javascript:alert(1)", "http://drive.google.com/file/d/no/view", "https://user:pass@drive.google.com/file/d/no/view"]) {
        expect((await admin.rpc("admin_save_event_material", { ...args, p_kind: kind, p_url: invalid })).error).not.toBeNull();
      }
    }
    expect((await admin.rpc("admin_save_event_material", { ...args, p_kind: "gallery", p_url: "https://photos.app.goo.gl.evil.example/album" })).error).not.toBeNull();
    for (const actor of [student, anonymous]) {
      expect((await actor.rpc("admin_save_event_material", args)).error).not.toBeNull();
      expect((await actor.rpc("admin_delete_event_material", { p_event_id: events.visible.id, p_id: galleryId })).error).not.toBeNull();
      expect((await actor.from("event_materials").insert({ event_id: events.visible.id, kind: "resource", label: "Forbidden", url: resourceUrl, published: true, created_by: accounts.student.id })).error).not.toBeNull();
    }
    for (const actor of [student, admin]) {
      expect((await actor.from("event_materials").update({ label: "Forbidden" }).eq("id", galleryId)).error).not.toBeNull();
      expect((await actor.from("event_materials").delete().eq("id", galleryId)).error).not.toBeNull();
    }
    expect((await admin.rpc("admin_delete_event_material", { p_event_id: events.other.id, p_id: galleryId })).error).not.toBeNull();
    expect((await admin.rpc("admin_save_event_material", { ...args, p_event_id: events.other.id, p_id: galleryId })).error).not.toBeNull();
    await row("Edited synthetic gallery").getByRole("button", { name: "Edit", exact: true }).click();
    await adminPage.getByLabel("Published to students", { exact: true }).uncheck();
    await adminPage.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(async () => (await student.from("event_materials").select("id").eq("id", galleryId)).data?.length).toBe(0);
    await studentPage.reload();
    await expect(studentPage.getByRole("link", { name: "Edited synthetic gallery", exact: true })).toHaveCount(0);
    await row("Edited synthetic gallery").getByRole("button", { name: "Remove", exact: true }).click();
    await row("Edited synthetic gallery").getByRole("button", { name: "Confirm removal", exact: true }).click();
    await expect(adminPage.getByRole("link", { name: "Edited synthetic gallery", exact: true })).toHaveCount(0);
    await studentPage.goto(`${studentOrigin}/events/${events.draft.id}/materials`);
    await expect(studentPage.getByText("Event unavailable.", { exact: true })).toBeVisible();
    await expect(studentPage.getByRole("link", { name: "Draft event secret", exact: true })).toHaveCount(0);
    await login(studentPage, adminOrigin, accounts.student);
    await studentPage.goto(`${adminOrigin}/events/${events.visible.id}/materials`);
    await expect(studentPage.getByRole("heading", { name: "Admin access required", exact: true })).toBeVisible();
  } finally {
    await Promise.all([admin.auth.signOut(), student.auth.signOut(), ...contexts.map((context) => context.close())]);
  }
});

test("admin CSV includes all 105 participants, applies filters, escapes content, and rejects revoked access", async ({ browser }) => {
  const admin = await authenticated(accounts.admin), student = await authenticated(accounts.student), revoked = await authenticated(accounts.revoked), anonymous = client();
  const context = await browser.newContext();
  const page = await context.newPage();
  const args = { p_event_id: events.visible.id, p_download: true };
  try {
    const all = await admin.rpc("admin_event_participant_export", args);
    expect(all.error).toBeNull(); expect(all.data.count).toBe(105); expect(all.data.rows).toHaveLength(105);
    const preview = await admin.rpc("admin_event_participant_export", { ...args, p_download: false });
    expect(preview.error).toBeNull(); expect(preview.data.count).toBe(105); expect(preview.data.rows).toHaveLength(10);
    const expected = participants.filter((entry) => entry.department === "Computer Science" && entry.year === 1);
    const filtered = await admin.rpc("admin_event_participant_export", { ...args, p_department: "Computer Science", p_academic_year: 1 });
    expect(filtered.error).toBeNull(); expect(filtered.data.count).toBe(expected.length);
    expect(filtered.data.rows.map((entry: { roll_number: string }) => entry.roll_number).sort()).toEqual(expected.map((entry) => entry.roll).sort());
    const searched = await admin.rpc("admin_event_participant_export", { ...args, p_search: participants[104].roll });
    expect(searched.error).toBeNull(); expect(searched.data.count).toBe(1); expect(searched.data.rows[0].roll_number).toBe(participants[104].roll);
    const other = await admin.rpc("admin_event_participant_export", { ...args, p_event_id: events.other.id });
    expect(other.error).toBeNull(); expect(other.data.count).toBe(1);
    await login(page, adminOrigin, accounts.admin);
    await page.goto(`${adminOrigin}/events/${events.visible.id}/export`);
    await expect(page.getByRole("heading", { name: "Export participants", exact: true })).toBeVisible();
    const downloadRows = async () => {
      const pending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download CSV", exact: true }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toMatch(/\.csv$/); expect(await download.failure()).toBeNull();
      const path = await download.path(); expect(path).not.toBeNull();
      return csvRows(await readFile(path!, "utf8"));
    };
    const downloaded = await downloadRows();
    expect(downloaded[0]).toEqual(["full_name", "roll_number", "course", "branch", "department", "section", "academic_year", "registered_at"]);
    expect(downloaded).toHaveLength(106);
    expect(downloaded.slice(1).map((entry) => entry[1]).sort()).toEqual(participants.map((entry) => entry.roll).sort());
    expect(downloaded.find((entry) => entry[1] === participants[0].roll)?.[0]).toBe("'=SUM(1,2)");
    expect(downloaded.find((entry) => entry[1] === participants[1].roll)?.[0]).toBe(participants[1].fullName);
    await page.getByLabel("Department (exact match)", { exact: true }).fill("Computer Science");
    await page.getByLabel("Academic year", { exact: true }).selectOption("1");
    await page.getByRole("button", { name: "Preview participants", exact: true }).click();
    await expect(page.getByText(`${expected.length} matching participants`, { exact: true })).toBeVisible();
    const filteredDownload = await downloadRows();
    expect(filteredDownload).toHaveLength(expected.length + 1);
    expect(filteredDownload.slice(1).map((entry) => entry[1]).sort()).toEqual(expected.map((entry) => entry.roll).sort());
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await page.getByLabel("Name or registration number", { exact: true }).fill(participants[104].roll);
    await page.getByRole("button", { name: "Preview participants", exact: true }).click();
    await expect(page.getByText("1 matching participants", { exact: true })).toBeVisible();
    const searchDownload = await downloadRows();
    expect(searchDownload).toHaveLength(2); expect(searchDownload[1][1]).toBe(participants[104].roll);
    await page.getByLabel("Name or registration number", { exact: true }).fill("No-such-synthetic-participant");
    await page.getByRole("button", { name: "Preview participants", exact: true }).click();
    await expect(page.getByText("No participants match these filters.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeDisabled();
    for (const actor of [student, anonymous]) expect((await actor.rpc("admin_event_participant_export", args)).error).not.toBeNull();
    expect((await admin.rpc("admin_set_access", { p_email: accounts.revoked.email, p_active: false, p_reason: "Synthetic export authority revocation check" })).error).toBeNull();
    expect((await revoked.rpc("admin_event_participant_export", args)).error?.message).toContain("ADMIN_REQUIRED");
    await login(page, adminOrigin, accounts.student);
    await page.goto(`${adminOrigin}/events/${events.visible.id}/export`);
    await expect(page.getByRole("heading", { name: "Admin access required", exact: true })).toBeVisible();
  } finally {
    await Promise.all([admin.auth.signOut(), student.auth.signOut(), revoked.auth.signOut(), context.close()]);
  }
});
