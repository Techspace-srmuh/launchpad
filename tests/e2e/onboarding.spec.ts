import { expect, test } from "@playwright/test";

test.describe("Student Onboarding UI - Visual Consistency and Sequential Matrix Typography", () => {
  test("keeps descriptions close to natural-height headings across all slides", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:5173/welcome");

    // Slide 1: Welcome
    await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();

    const scene1 = page.locator(".intro-scene");
    const headingBox1 = page.locator(".intro-heading");
    const descBox1 = page.locator(".intro-description-container");
    const pagination1 = page.locator(".intro-pagination");

    await expect(scene1).toBeVisible();
    await expect(headingBox1).toBeVisible();
    await expect(descBox1).toBeVisible();
    await expect(pagination1).toBeVisible();

    const s1Box = await scene1.boundingBox();
    const h1Box = await headingBox1.boundingBox();
    const d1Box = await descBox1.boundingBox();
    const p1Box = await pagination1.boundingBox();

    expect(s1Box).not.toBeNull();
    expect(h1Box).not.toBeNull();
    expect(d1Box).not.toBeNull();
    expect(p1Box).not.toBeNull();
    expect((d1Box?.y ?? 0) - ((h1Box?.y ?? 0) + (h1Box?.height ?? 0))).toBeCloseTo(12, 0);

    // Verify sunburst rays appear on slide 1
    await expect(page.locator(".intro-rays")).toBeVisible();

    // Verify animated stars and 2 revolving orbiting stars appear on slide 1
    await expect(page.locator(".onboarding-stars-coding .onboarding-orbit-star")).toHaveCount(2);
    await expect(page.locator(".onboarding-stars-coding .onboarding-blinking-star")).toHaveCount(2);

    // Verify no detached flame or waving flag overlays exist
    await expect(page.locator(".onboarding-flame")).toHaveCount(0);
    await expect(page.locator(".onboarding-flag-wave")).toHaveCount(0);

    // Advance to Slide 2: Discover & Join
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.getByRole("heading", { name: "Discover & Join" })).toBeVisible();

    const scene2 = page.locator(".intro-scene");
    const headingBox2 = page.locator(".intro-heading");
    const descBox2 = page.locator(".intro-description-container");
    const pagination2 = page.locator(".intro-pagination");

    const s2Box = await scene2.boundingBox();
    const h2Box = await headingBox2.boundingBox();
    const d2Box = await descBox2.boundingBox();
    const p2Box = await pagination2.boundingBox();

    // Heading container must begin at the EXACT same vertical position (<= 2px tolerance for subpixel rounding)
    expect(Math.abs((h2Box?.y ?? 0) - (h1Box?.y ?? 0))).toBeLessThanOrEqual(2);
    // Description follows the actual heading height with one shared gap
    expect((d2Box?.y ?? 0) - ((h2Box?.y ?? 0) + (h2Box?.height ?? 0))).toBeCloseTo(12, 0);
    // Pagination dots alignment matches Slide 1 exactly (zero vertical jump)
    expect(Math.abs((p2Box?.y ?? 0) - (p1Box?.y ?? 0))).toBeLessThanOrEqual(1);
    // Scene stage height remains identical
    expect(Math.abs((s2Box?.height ?? 0) - (s1Box?.height ?? 0))).toBeLessThanOrEqual(2);

    // Slide 2: Animated rocket video is present, muted, loop, inline, and fully visible
    const video = page.locator(".onboarding-video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", "/assets/onboarding/rocket-animation.mp4");
    await expect(video).toHaveAttribute("loop", "");
    // Previous static illustration must be completely removed
    await expect(video).not.toHaveAttribute("poster", /.+/);
    await expect(page.locator(".onboarding-art-rocket")).toHaveCount(0);

    // No animated flame overlay or duplicate elements
    await expect(page.locator(".onboarding-flame")).toHaveCount(0);

    // Advance to Slide 3: Participate & Grow
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Participate & Grow" })).toBeVisible();

    const scene3 = page.locator(".intro-scene");
    const headingBox3 = page.locator(".intro-heading");
    const descBox3 = page.locator(".intro-description-container");
    const pagination3 = page.locator(".intro-pagination");

    const s3Box = await scene3.boundingBox();
    const h3Box = await headingBox3.boundingBox();
    const d3Box = await descBox3.boundingBox();
    const p3Box = await pagination3.boundingBox();

    // Slide 3 vertical alignment check
    expect(Math.abs((h3Box?.y ?? 0) - (h1Box?.y ?? 0))).toBeLessThanOrEqual(2);
    expect((d3Box?.y ?? 0) - ((h3Box?.y ?? 0) + (h3Box?.height ?? 0))).toBeCloseTo(12, 0);
    // Pagination dots alignment matches Slide 1 exactly (zero vertical jump)
    expect(Math.abs((p3Box?.y ?? 0) - (p1Box?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((s3Box?.height ?? 0) - (s1Box?.height ?? 0))).toBeLessThanOrEqual(2);

    // Slide 3: Flag illustration, revolving stars, and animated stars are present
    await expect(page.locator(".onboarding-art-flag")).toBeVisible();
    await expect(page.locator(".onboarding-stars-flag .onboarding-orbit-star")).toHaveCount(2);
    await expect(page.locator(".onboarding-stars-flag .onboarding-blinking-star")).toHaveCount(2);
    await expect(page.locator(".onboarding-flag-wave")).toHaveCount(0);

    // Navigate backward using pagination indicator to Slide 2
    await page.getByRole("button", { name: "Go to slide 2" }).click();
    await expect(page.getByRole("heading", { name: "Discover & Join" })).toBeVisible();

    // Return to Slide 1
    await page.getByRole("button", { name: "Go to slide 1" }).click();
    await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();

    // Ensure no horizontal scroll overflow exists on the page
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });

  test("slide 2 animated video is fully visible without clipping", async ({ page }) => {
    await page.goto("http://127.0.0.1:5173/welcome");
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.getByRole("heading", { name: "Discover & Join" })).toBeVisible();

    const scene = page.locator(".intro-scene");
    const sceneBox = await scene.boundingBox();
    expect(sceneBox).not.toBeNull();
    if (!sceneBox) return;

    const video = page.locator(".onboarding-video");
    await expect(video).toBeVisible();
    const videoBox = await video.boundingBox();
    expect(videoBox).not.toBeNull();
    if (!videoBox) return;

    // The video top must have headroom and not exceed the scene container top
    expect(videoBox.y).toBeGreaterThanOrEqual(sceneBox.y - 1);
    // The video bottom must remain inside the scene container bottom
    expect(videoBox.y + videoBox.height).toBeLessThanOrEqual(sceneBox.y + sceneBox.height + 1);

    // Verify video properties
    const videoProps = await video.evaluate((el) => {
      const v = el as HTMLVideoElement;
      return {
        muted: v.muted,
        loop: v.loop,
        playsInline: v.playsInline,
        controls: v.controls,
      };
    });
    expect(videoProps.muted).toBe(true);
    expect(videoProps.loop).toBe(true);
    expect(videoProps.playsInline).toBe(true);
    expect(videoProps.controls).toBe(false);
  });

  test("heading rocket animation conforms to exact 45px width, 1.08s linear timing (2x speed), and one-shot playback", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:5173/welcome");
    await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();

    const rocket = page.locator(".heading-rocket");
    await expect(rocket).toBeVisible();

    const rocketBox = await rocket.boundingBox();
    expect(rocketBox).not.toBeNull();
    // Rocket width must be 45px
    expect(Math.round(rocketBox?.width ?? 0)).toBe(45);

    // Verify CSS animation properties
    const animProps = await rocket.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        animationTimingFunction: style.animationTimingFunction,
        animationIterationCount: style.animationIterationCount,
        animationFillMode: style.animationFillMode,
      };
    });

    expect(animProps.animationName).toBe("rocketMove");
    expect(animProps.animationDuration).toBe("1.08s");
    expect(animProps.animationTimingFunction).toBe("linear");
    expect(animProps.animationIterationCount).toBe("1");
    expect(animProps.animationFillMode).toBe("forwards");
  });

  test("supports swipe gestures between slides", async ({ page }) => {
    await page.goto("http://127.0.0.1:5173/welcome");
    await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();

    const screen = page.locator(".onboarding-screen");
    const box = await screen.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width * 0.75;
    const endX = box.x + box.width * 0.25;
    const y = box.y + box.height * 0.4;

    // Swipe left (advance to slide 2)
    await screen.dispatchEvent("touchstart", {
      touches: [{ identifier: 0, clientX: startX, clientY: y }],
    });
    await screen.dispatchEvent("touchend", {
      changedTouches: [{ identifier: 0, clientX: endX, clientY: y }],
    });

    await expect(page.getByRole("heading", { name: "Discover & Join" })).toBeVisible();

    // Swipe right (navigate backward to slide 1)
    await screen.dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: endX, clientY: y }],
    });
    await screen.dispatchEvent("touchend", {
      changedTouches: [{ identifier: 1, clientX: startX, clientY: y }],
    });

    await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();
  });

  test("respects prefers-reduced-motion media query", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:5173/welcome");

    await expect(page.getByRole("heading", { name: /Welcome to Launchpad/ })).toBeVisible();

    // Under reduced motion, heading lines are immediately visible with opacity 1
    const headingContent = page.locator(".heading-line-content").first();
    await expect(headingContent).toBeVisible();
    const opacity = await headingContent.evaluate((el) => window.getComputedStyle(el).opacity);
    expect(opacity).toBe("1");

    // Descriptions are also immediately visible
    const descContent = page.locator(".desc-line-content").first();
    await expect(descContent).toBeVisible();

    // Navigation still works cleanly with reduced motion
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.getByRole("heading", { name: "Discover & Join" })).toBeVisible();
  });
});
