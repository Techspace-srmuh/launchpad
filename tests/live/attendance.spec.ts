import QRCode from "qrcode";
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
  await expect(page.getByRole("button", { name: "Sign out", exact: true }).or(page.getByRole("heading", { name: "Complete your profile", exact: true }))).toBeVisible({ timeout: 30_000 });
}

test("QR attendance: student generates credential, admin validates check-in, duplicate/window/unauthorized rejected, and manual correction audited", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const otherContext = await browser.newContext();
  const [adminPage, studentPage] = await Promise.all([
    adminContext.newPage(),
    studentContext.newPage(),
  ]);

  const clients = Object.fromEntries(Object.keys(accounts).map((role) => [role, createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })]));

  const attEventTitle = `${eventTitle} attendance test`;
  const otherEventTitle = `${eventTitle} other event`;

  try {
    for (const [role, account] of Object.entries(accounts)) {
      const { error } = await clients[role].auth.signInWithPassword({ email: account.email, password: account.password });
      expect(error?.message, `${role} test account can authenticate`).toBeUndefined();
    }

    // Ensure student profile is complete
    const profile = await clients.student.from("profiles").select("*").single();
    expect(profile.error).toBeNull();
    const completeProfile = await clients.student.rpc("save_profile", {
      p_full_name: profile.data.full_name, p_roll_number: profile.data.roll_number,
      p_department: profile.data.department, p_academic_year: profile.data.academic_year,
      p_course: "B.Tech", p_branch: "Computer Science", p_section: "A", p_mobile_number: "9876543210",
    });
    expect(completeProfile.error).toBeNull();

    // Create an active event: starts 1 hour ago, ends in 2 hours (currently in check-in window)
    const now = Date.now();
    const date = (msOffset: number) => new Date(now + msOffset).toISOString();

    const savedEvent = await clients.admin.rpc("admin_save_event", { p_event: {
      title: attEventTitle, description: "Attendance live test fixture.", venue: "Main Auditorium",
      starts_at: date(-3600000), ends_at: date(7200000),
      registration_opens_at: date(-7200000), registration_closes_at: date(3600000),
      capacity: 10, status: "published",
    } });
    expect(savedEvent.error).toBeNull();
    const eventId = savedEvent.data.id as string;

    // Create a second event (different event for wrong-event scan test)
    const savedOtherEvent = await clients.admin.rpc("admin_save_event", { p_event: {
      title: otherEventTitle, description: "Other event fixture.", venue: "Lab 2",
      starts_at: date(-3600000), ends_at: date(7200000),
      registration_opens_at: date(-7200000), registration_closes_at: date(3600000),
      capacity: 10, status: "published",
    } });
    expect(savedOtherEvent.error).toBeNull();
    const otherEventId = savedOtherEvent.data.id as string;

    // Student registers for main event
    const regResult = await clients.student.rpc("register_for_event", { p_event_id: eventId });
    expect(regResult.error).toBeNull();

    // Other student registers for otherEvent
    const otherProfile = await clients.other.from("profiles").select("*").single();
    if (!otherProfile.data?.course) {
      await clients.other.rpc("save_profile", {
        p_full_name: otherProfile.data?.full_name ?? "Other Student",
        p_roll_number: otherProfile.data?.roll_number ?? "OTHER123",
        p_department: "ECE", p_academic_year: 2,
        p_course: "B.Tech", p_branch: "ECE", p_section: "B", p_mobile_number: "9876543211",
      });
    }
    const otherRegResult = await clients.other.rpc("register_for_event", { p_event_id: otherEventId });
    expect(otherRegResult.error).toBeNull();

    // 1. Student generates QR credential via RPC
    const qrResult = await clients.student.rpc("generate_qr_credential", { p_event_id: eventId });
    expect(qrResult.error).toBeNull();
    const studentToken = qrResult.data as string;
    expect(studentToken).toHaveLength(64);

    // 2. Student views QR on event detail page in browser
    await login(studentPage, studentOrigin, accounts.student);
    await studentPage.goto(`${studentOrigin}/events/${eventId}`);
    await expect(studentPage.getByText("You are registered for this event.", { exact: true })).toBeVisible();
    await expect(studentPage.getByRole("heading", { name: "Your event attendance QR", exact: true })).toBeVisible();
    await expect(studentPage.getByRole("img", { name: "Your event check-in QR code" })).toBeVisible();
    await expect(studentPage.getByText("Status: Registered · Awaiting check-in")).toBeVisible();

    // 3. Unauthorized checks
    // Student cannot scan
    const studentScan = await clients.student.rpc("validate_check_in", { p_token: studentToken, p_event_id: eventId });
    expect(studentScan.error?.message).toContain("ADMIN_REQUIRED");

    // Anonymous cannot scan
    const anonymous = createClient(url, key, { auth: { persistSession: false } });
    const anonScan = await anonymous.rpc("validate_check_in", { p_token: studentToken, p_event_id: eventId });
    expect(anonScan.error).not.toBeNull();

    // 4. Wrong event scan check
    // Generate other student's token for otherEvent
    const otherTokenResult = await clients.other.rpc("generate_qr_credential", { p_event_id: otherEventId });
    expect(otherTokenResult.error).toBeNull();
    const otherToken = otherTokenResult.data as string;

    // Scan other student's token against first event -> WRONG_EVENT
    const wrongEventScan = await clients.admin.rpc("validate_check_in", { p_token: otherToken, p_event_id: eventId });
    expect(wrongEventScan.error?.message).toContain("WRONG_EVENT");

    // Feed an actual QR image through the jsQR canvas/video fallback and real RPC.
    const image = await QRCode.toDataURL(studentToken, { width: 320, margin: 4 });
    await adminPage.addInitScript(({ image }) => {
      Object.defineProperty(window, "BarcodeDetector", { value: undefined, configurable: true });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
        const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 320;
        const qr = new Image(); qr.src = image; await qr.decode();
        canvas.getContext("2d")!.drawImage(qr, 0, 0);
        const stream = canvas.captureStream(5);
        Object.assign(window, { testCameraTrack: stream.getVideoTracks()[0] });
        return stream;
      } });
    }, { image });
    await login(adminPage, adminOrigin, accounts.admin);
    await adminPage.goto(`${adminOrigin}/events/${eventId}/attendance`);
    await adminPage.getByRole("button", { name: "Start camera scanner", exact: true }).click();
    await expect(adminPage.getByText("Check-in recorded successfully!", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(adminPage.getByRole("button", { name: "Stop camera", exact: true })).toBeVisible();
    await adminPage.getByRole("button", { name: "Refresh records", exact: true }).click();
    await expect(adminPage.getByText("Refreshing attendance data…", { exact: true })).toHaveCount(0);
    expect(await adminPage.locator("video").evaluate((video: HTMLVideoElement) => Boolean(video.srcObject) && video.readyState >= 2)).toBe(true);

    // 6. Duplicate scan -> ALREADY_CHECKED_IN
    const dupScan = await clients.admin.rpc("validate_check_in", { p_token: studentToken, p_event_id: eventId });
    expect(dupScan.error?.message).toContain("ALREADY_CHECKED_IN");

    // 7. Student refreshes page -> sees "Checked in"
    await studentPage.reload();
    await expect(studentPage.getByText(/✓ Checked in at/)).toBeVisible();

    // 8. Admin attendance UI check
    await expect(adminPage.getByRole("heading", { name: "Attendance check-in", exact: true })).toBeVisible();
    await expect(adminPage.getByText("Checked in", { exact: true })).toBeVisible();

    await expect(adminPage.getByRole("cell", { name: profile.data.full_name, exact: true })).toBeVisible();
    await expect(adminPage.getByRole("cell", { name: profile.data.roll_number, exact: true })).toBeVisible();
    await adminPage.getByRole("button", { name: "Stop camera", exact: true }).click();
    expect(await adminPage.evaluate(() => (window as unknown as { testCameraTrack: MediaStreamTrack }).testCameraTrack.readyState)).toBe("ended");

    // 9. Manual correction: mark absent with reason
    await adminPage.getByRole("button", { name: "Mark absent", exact: true }).click();
    await adminPage.getByPlaceholder("Explain the reason for this manual correction...").fill("Student stepped out for medical check");
    await adminPage.getByRole("button", { name: "Confirm correction", exact: true }).click();
    await expect(adminPage.getByRole("heading", { name: "Correct attendance record", exact: true })).toHaveCount(0);
    await expect(adminPage.getByRole("cell").filter({ hasText: "Student stepped out for medical check" })).toBeVisible();

    // 10. Verify audit log contains correction
    const { data: auditLogs, error: auditError } = await clients.admin.from("audit_logs")
      .select("*")
      .eq("action", "attendance.corrected")
      .eq("actor_id", accounts.admin.id)
      .eq("details->>event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(auditError).toBeNull();
    expect(auditLogs?.[0]?.details?.reason).toBe("Student stepped out for medical check");
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));
    await Promise.all([adminContext.close(), studentContext.close(), otherContext.close()]);
  }
});
