import { expect, test } from "@playwright/test";

const surfaces = [
  { name: "student", origin: "http://127.0.0.1:5183" },
  { name: "admin", origin: "http://127.0.0.1:5184" },
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
    await expect(page.getByRole("status")).toContainText("Setup needed");
    await expect(page.getByRole("navigation")).toBeVisible();

    await page.getByRole("navigation").getByRole("link", { name: "Setup", exact: true }).click();
    await expect(page).toHaveURL(`${surface.origin}/setup`);
    await expect(page.getByText("VITE_MAIN_SUPABASE_URL is required.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).toContainText("VITE_MAIN_SUPABASE_PUBLISHABLE_KEY");

    await page.goto(`${surface.origin}/not-a-launchpad-page`);
    await expect(page.locator("main")).toContainText("404");
    await page.getByRole("link", { name: /Return (home|to overview)/ }).click();
    await expect(page).toHaveURL(`${surface.origin}/`);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(backendRequests).toEqual([]);
  });
}
