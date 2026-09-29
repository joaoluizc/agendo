import { useSyncExternalStore } from "react";

/**
 * One `MediaQueryList` per query, shared by every component that asks. A day's grid
 * renders around a hundred shift blocks, and each asking for its own list would mean a
 * hundred listeners on the same media query.
 */
const lists = new Map<string, MediaQueryList>();

const listFor = (query: string): MediaQueryList | null => {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  let list = lists.get(query);
  if (!list) {
    list = window.matchMedia(query);
    lists.set(query, list);
  }
  return list;
};

/** Whether `query` matches right now, re-rendering when that changes. */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = listFor(query);
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    },
    () => listFor(query)?.matches ?? false
  );

/**
 * A phone-sized screen: below Tailwind's `md`, the same line where the header swaps its
 * menu for the hamburger. Layout only — whether a gesture is a touch is
 * `useIsCoarsePointer`'s question, since a phone in landscape or a tablet is wider than
 * this and still has no mouse.
 *
 * Written as Tailwind's own `max-md` query, so code reading this and classes using
 * `max-md:`/`md:` switch at exactly the same width, fractional pixels included.
 */
export const MOBILE_QUERY = "not all and (min-width: 768px)";
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);

/** Whether the screen's main pointer is a finger rather than a mouse or trackpad. */
export const useIsCoarsePointer = () => useMediaQuery("(pointer: coarse)");

/** `useIsMobile` for a one-off read outside render, such as a state initialiser. */
export const isMobileNow = () => listFor(MOBILE_QUERY)?.matches ?? false;
