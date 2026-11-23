import { describe, it, expect } from "vitest";
import { calculateJitterDelay } from "./announcement-notifier";

describe("calculateJitterDelay", () => {
  it("produces values strictly within the requested jitter boundaries", () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateJitterDelay(1500, 4000);
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(4000);
    }
  });

  it("defaults to 1500ms min and 4000ms max", () => {
    const delay = calculateJitterDelay();
    expect(delay).toBeGreaterThanOrEqual(1500);
    expect(delay).toBeLessThanOrEqual(4000);
  });
});
