import { describe, expect, it } from "vitest";

import {
  motionSafeScrollBehavior,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
  scrollDashboardToView,
} from "../src/client/motion";
import type { View } from "../src/client/types";

describe("dashboard motion", () => {
  it("uses instant scrolling when the user prefers reduced motion", () => {
    expect(prefersReducedMotion((query) => query === REDUCED_MOTION_QUERY)).toBe(true);
    expect(prefersReducedMotion(() => false)).toBe(false);
    expect(motionSafeScrollBehavior(true)).toBe("auto");
    expect(motionSafeScrollBehavior(false)).toBe("smooth");
  });

  it("scrolls the unique view anchor on desktop and the page top on small screens", () => {
    const desktop: Array<{ id: string; behavior: ScrollBehavior }> = [];
    const mobile: ScrollToOptions[] = [];

    scrollDashboardToView("activity", {
      isDesktop: true,
      behavior: "auto",
      getElementById: (id) => ({
        scrollIntoView: (options) => {
          desktop.push({ id, behavior: options?.behavior ?? "auto" });
        },
      }),
    });

    scrollDashboardToView("queue" satisfies View, {
      isDesktop: false,
      behavior: "auto",
      scrollTo: (options) => {
        mobile.push(options);
      },
    });

    expect(desktop).toEqual([{ id: "activity-view", behavior: "auto" }]);
    expect(mobile).toEqual([{ top: 0, behavior: "auto" }]);
  });
});
