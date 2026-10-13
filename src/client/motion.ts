import type { View } from "./types";

export const DESKTOP_LAYOUT_QUERY = "(min-width: 821px)";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(
  matches: (query: string) => boolean = (query) => window.matchMedia(query).matches,
): boolean {
  return matches(REDUCED_MOTION_QUERY);
}

export function motionSafeScrollBehavior(reducedMotion = prefersReducedMotion()): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

type ScrollTarget = { scrollIntoView(options?: ScrollIntoViewOptions): void };

type ScrollDashboardOptions = {
  isDesktop?: boolean;
  behavior?: ScrollBehavior;
  getElementById?: (id: string) => ScrollTarget | null;
  scrollTo?: (options: ScrollToOptions) => void;
};

export function scrollDashboardToView(view: View, options: ScrollDashboardOptions = {}): void {
  const behavior = options.behavior ?? motionSafeScrollBehavior();
  const isDesktop = options.isDesktop ?? window.matchMedia(DESKTOP_LAYOUT_QUERY).matches;

  if (isDesktop) {
    const getElementById = options.getElementById ?? ((id) => document.querySelector(`#${id}`));
    getElementById(`${view}-view`)?.scrollIntoView({ behavior, block: "start" });

    return;
  }

  const scrollTo = options.scrollTo ?? ((opts) => window.scrollTo(opts));
  scrollTo({ top: 0, behavior });
}
