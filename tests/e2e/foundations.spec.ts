import { expect, test } from "@playwright/test";

const surfaces = [
  { name: "student", origin: "http://127.0.0.1:5173" },
  { name: "admin", origin: "http://127.0.0.1:5174" },
] as const;

for (const surface of surfaces) {
  test(`${surface.name}: shell, setup and recovery routes work without backend calls`, async ({ page }) => {
    const errors: string[] = [];
    const backendRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).hostname.endsWith("supabase.co")) {
        backendRequests.push(request.url());
      }
    });

    await page.goto(surface.origin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const studentMobile = surface.name === "student" && (page.viewportSize()?.width ?? 0) <= 700;
    if (surface.name === "student") {
      await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();
      await expect(page.getByRole("navigation", { name: studentMobile ? "Mobile navigation" : "Main navigation" })).toHaveCount(0);
      await page.getByRole("link", { name: "I already have an account" }).click();
      await page.getByRole("link", { name: "View setup" }).click();
    } else {
      await expect(page.getByRole("status")).toContainText("Setup needed");
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Setup", exact: true }).click();
    }
    await expect(page).toHaveURL(`${surface.origin}/setup`);
    await expect(page.getByText("NEXT_PUBLIC_MAIN_SUPABASE_URL is required.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).toContainText("NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY");

    const missing = await page.goto(`${surface.origin}/not-a-launchpad-page`);
    expect(missing?.status()).toBe(404);
    await expect(page.locator("main")).toContainText("404");
    await page.getByRole("link", { name: /Return (home|to overview)/ }).click();
    await expect(page).toHaveURL(`${surface.origin}/`);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(backendRequests).toEqual([]);
  });

  test(`${surface.name}: Next.js direct routes and navigation retain access gates`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const eventId = "00000000-0000-4000-8000-000000000001";
    const routes = surface.name === "student"
      ? [`/events/${eventId}/materials`, "/announcements", "/events", `/events/${eventId}`, "/my-events", "/profile", "/settings"]
      : [`/events/${eventId}/materials`, `/events/${eventId}/export`, "/announcements", "/admins", "/events", "/events/new", `/events/${eventId}/attendance`, `/events/${eventId}/edit`, `/events/${eventId}/participants`, "/profile"];
    for (const route of routes) {
      const response = await page.goto(`${surface.origin}${route}`);
      expect(response?.status(), route).toBe(200);
      await expect(page.getByRole("heading", { name: "Setup needed", exact: true })).toBeVisible();
    }
    await page.goto(`${surface.origin}/setup`);
    const studentMobile = surface.name === "student" && (page.viewportSize()?.width ?? 0) <= 700;
    if (studentMobile) {
      await expect(page.getByRole("heading", { name: /Prepare your/ })).toBeVisible();
      await page.goto(`${surface.origin}/account`);
    } else if (surface.name === "student") {
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Setup", exact: true })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Explore Events", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Open account menu for Student" }).click();
      await expect(page.getByRole("menuitem", { name: "Account Settings" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menuitem", { name: "Account Settings" })).toHaveCount(0);
      await page.goto(`${surface.origin}/account`);
    } else {
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Setup", exact: true })).toHaveAttribute("aria-current", "page");
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Account", exact: true }).click();
    }
    await expect(page).toHaveURL(`${surface.origin}/account`);
    await expect(page.getByRole("heading", { name: surface.name === "student" ? "Sign in to continue" : "Account" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${surface.origin}/setup`);
    await page.reload();
    await expect(page.locator("body")).toContainText("NEXT_PUBLIC_MAIN_SUPABASE_URL");
    expect(errors).toEqual([]);
  });
}

test("student: welcome flow reaches account on mobile and desktop", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");
  await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();
  await page.getByRole("button", { name: "Get Started", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discover & Join" })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Participate & Grow" })).toBeVisible();
  await page.getByRole("link", { name: "Continue to sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:5173/account");
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
  await page.getByRole("button", { name: /Continue with Email/ }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await page.goto("http://127.0.0.1:5173/welcome");
  await page.getByRole("button", { name: "Go to slide 2" }).click();
  await page.getByRole("link", { name: "Skip introduction", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:5173/account");
});
