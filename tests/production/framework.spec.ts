import { expect, test } from "@playwright/test";

for (const surface of [
  { name: "student", origin: "http://127.0.0.1:5193" },
  { name: "admin", origin: "http://127.0.0.1:5194" },
] as const) {
  test(`${surface.name}: production routing and development-login boundary`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${surface.origin}/account`);
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);

    const id = "00000000-0000-4000-8000-000000000001";
    const routes = surface.name === "student"
      ? [`/events/${id}`]
      : [`/events/${id}/edit`, `/events/${id}/participants`, "/events/new"];
    for (const route of routes) {
      const response = await page.goto(`${surface.origin}${route}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: /^(Sign in required|Setup needed)$/ })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: /^(Sign in required|Setup needed)$/ })).toBeVisible();
    }
    const missing = await page.goto(`${surface.origin}/not-a-launchpad-page`);
    expect(missing?.status()).toBe(404);
    await page.getByRole("link", { name: /Return (home|to overview)/ }).click();
    await expect(page).toHaveURL(`${surface.origin}/`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
