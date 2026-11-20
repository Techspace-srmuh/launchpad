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
    // If this build has public backend settings, the Google entry point must
    // report provider setup failures in-app rather than pretending to sign in.
    const google = page.getByRole("button", { name: "Continue with Google", exact: true });
    if (await google.count()) {
      await page.route("**/auth/v1/settings", (route) => route.fulfill({ json: { external: { google: false } } }));
      await google.click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Google sign-in is not configured yet.");
      await expect(page).toHaveURL(`${surface.origin}/account`);
    }
    // OAuth returns from another document, rather than a same-page hash change.
    await page.goto(surface.origin);
    await page.goto(`${surface.origin}/account#error=access_denied&error_description=private-provider-details`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Google sign-in was cancelled.");
    await expect(page).toHaveURL(`${surface.origin}/account`);
    await expect(page.getByRole("main")).not.toContainText("private-provider-details");

    const id = "00000000-0000-4000-8000-000000000001";
    const routes = surface.name === "student"
      ? ["/announcements", `/events/${id}`]
      : ["/announcements", "/admins", `/events/${id}/edit`, `/events/${id}/participants`, "/events/new"];
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
