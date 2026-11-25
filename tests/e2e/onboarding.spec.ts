import { expect, test } from "@playwright/test";

test.describe("Student Onboarding UI - Visual Consistency and Sequential Matrix Typography", () => {
  test("groups natural-height text and footer actions at mobile and desktop sizes", async ({
    page,
  }) => {
    for (const [width, height] of [
      [320, 568],
      [375, 812],
      [390, 844],
      [430, 932],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("http://127.0.0.1:5173/welcome");
      await expect(page.locator(".intro-brand")).toBeVisible();
      for (let slide = 1; slide <= 3; slide++) {
        await page
          .getByRole("button", { name: `Go to slide ${slide}` })
          .click();
        await expect(page.locator(".desc-line-content").last()).toHaveCSS(
          "opacity",
          "1",
        );
        await expect(page.locator(".heading-line-content").last()).toHaveCSS(
          "transform",
          "matrix(1, 0, 0, 1, 0, 0)",
        );
        const geometry = await page.evaluate(() => {
          const box = (selector: string) =>
            document.querySelector(selector)!.getBoundingClientRect();
          const h = box(".intro-heading"),
            d = box(".intro-description"),
            scene = box(".intro-scene");
          const primary = box(".intro-actions .onboarding-primary"),
            footer = box(".intro-footer"),
            dots = box(".intro-pagination");
          const lines = box(".intro-heading-lines");
          return {
            gap: d.top - h.bottom,
            sceneGap: h.top - scene.bottom,
            headingHeight: h.height,
            linesHeight: lines.height,
            actionGap: primary.top - dots.bottom,
            actionWidth: primary.width,
            footerWidth: footer.width,
            actionHeight: primary.height,
            overflow: document.documentElement.scrollWidth > innerWidth,
            cardHeight: box(".intro-screen").height,
          };
        });
        expect(geometry.gap).toBeCloseTo(12, 0);
        expect(geometry.sceneGap).toBeCloseTo(24, 0);
        expect(geometry.headingHeight).toBeCloseTo(geometry.linesHeight, 0);
        expect(geometry.actionGap).toBeCloseTo(24, 0);
        expect(geometry.actionWidth).toBeCloseTo(geometry.footerWidth, 0);
        expect(geometry.actionHeight).toBeGreaterThanOrEqual(54);
        expect(geometry.overflow).toBe(false);
        if (width === 1440) expect(geometry.cardHeight).toBeLessThan(800);
        if (slide !== 2) {
          await expect(
            page.locator(".is-active .onboarding-orbit-star"),
          ).toHaveCount(2);
          await expect(
            page.locator(".is-active .onboarding-blinking-star"),
          ).toHaveCount(2);
        }
      }
    }
  });

  test("rocket fallback survives media failure and rejected autoplay", async ({
    page,
  }) => {
    await page.route("**/rocket-animation.mp4", (route) => route.abort());
    await page.goto("http://127.0.0.1:5173/welcome");
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.locator(".onboarding-art-rocket")).toBeVisible();
    await expect(page.locator(".onboarding-video")).toBeHidden();
    await page.unroute("**/rocket-animation.mp4");
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () =>
        Promise.reject(new DOMException("Blocked", "NotAllowedError"));
    });
    await page.reload();
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.locator(".onboarding-art-rocket")).toBeVisible();
    await expect(page.locator(".onboarding-video")).toBeHidden();
  });

  test("rocket playback resumes after repeated navigation and shows a reduced-motion poster", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:5173/welcome");
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.getByRole("button", { name: "Go to slide 2" }).click();
      await expect(page.locator(".onboarding-video")).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator("video")
            .evaluate((v: HTMLVideoElement) => !v.paused && v.videoWidth > 0),
        )
        .toBe(true);
      await page.getByRole("button", { name: "Go to slide 3" }).click();
      await expect
        .poll(() =>
          page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
        )
        .toBe(true);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Go to slide 2" }).click();
    await expect(page.locator(".onboarding-art-rocket")).toBeVisible();
    await expect(page.locator(".onboarding-video")).toBeHidden();
    await expect
      .poll(() =>
        page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
      )
      .toBe(true);
  });
  test("slide 2 animated video is fully visible without clipping", async ({
    page,
  }) => {
    await page.goto("http://127.0.0.1:5173/welcome");
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(
      page.getByRole("heading", { name: "Discover & Join" }),
    ).toBeVisible();

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
    expect(videoBox.y + videoBox.height).toBeLessThanOrEqual(
      sceneBox.y + sceneBox.height + 1,
    );

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
    await expect(
      page.getByRole("heading", { name: /Welcome to Launchpad/ }),
    ).toBeVisible();

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
    await expect(
      page.getByRole("heading", { name: /Welcome to Launchpad/ }),
    ).toBeVisible();

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

    await expect(
      page.getByRole("heading", { name: "Discover & Join" }),
    ).toBeVisible();

    // Swipe right (navigate backward to slide 1)
    await screen.dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: endX, clientY: y }],
    });
    await screen.dispatchEvent("touchend", {
      changedTouches: [{ identifier: 1, clientX: startX, clientY: y }],
    });

    await expect(
      page.getByRole("heading", { name: /Welcome to Launchpad/ }),
    ).toBeVisible();
  });

  test("respects prefers-reduced-motion media query", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:5173/welcome");

    await expect(
      page.getByRole("heading", { name: /Welcome to Launchpad/ }),
    ).toBeVisible();

    // Under reduced motion, heading lines are immediately visible with opacity 1
    const headingContent = page.locator(".heading-line-content").first();
    await expect(headingContent).toBeVisible();
    const opacity = await headingContent.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(opacity).toBe("1");

    // Descriptions are also immediately visible
    const descContent = page.locator(".desc-line-content").first();
    await expect(descContent).toBeVisible();

    // Navigation still works cleanly with reduced motion
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(
      page.getByRole("heading", { name: "Discover & Join" }),
    ).toBeVisible();
  });
});
