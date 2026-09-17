import type { View } from "./types";

export const DESKTOP_LAYOUT_QUERY = "(min-width: 821px)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(media = window.matchMedia): boolean {
  return media(REDUCED_MOTION_QUERY).matches;
}

export function motionSafeScrollBehavior(reducedMotion = prefersReducedMotion()): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export function scrollDashboardToView(
  view: View,
  options: {
    isDesktop?: boolean;
    behavior?: ScrollBehavior;
    getElementById?: (id: string) => { scrollIntoView(options?: ScrollIntoViewOptions): void } | null;
    scrollTo?: (options: ScrollToOptions) => void;
  } = {},
): void {
  const behavior = options.behavior ?? motionSafeScrollBehavior();
  const isDesktop = options.isDesktop ?? window.matchMedia(DESKTOP_LAYOUT_QUERY).matches;

  if (isDesktop) {
    const getElementById = options.getElementById ?? ((id) => document.getElementById(id));
    getElementById(`${view}-view`)?.scrollIntoView({ behavior, block: "start" });
    return;
  }

  const scrollTo = options.scrollTo ?? ((opts) => window.scrollTo(opts));
  scrollTo({ top: 0, behavior });
}
