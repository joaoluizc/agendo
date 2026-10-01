import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { IS_PHONE } from "@/hooks/useMediaQuery";

/**
 * The toolbar's three arrangements of its three groups — the day (stepper, picker, zoom),
 * the view (location filter, events switch) and the actions:
 *
 * - `one-line`: day and view on the left, actions on the right.
 * - `two-line`: day left and actions right, then the view on a line of its own, filter
 *   left and switch right.
 * - `stacked`: a line per group, each from the left edge, with the events switch and
 *   New shift at the right edge.
 *
 * Each line either holds the whole toolbar or spans the full width, so its edges line up
 * with the lines around it. The toolbar used to wrap freely instead, and at widths between
 * a phone and a wide desktop that left a control alone on a line, or a line ending short
 * of the one under it.
 */
export type ToolbarLayout = "one-line" | "two-line" | "stacked";

const widthOf = (el: Element) => el.getBoundingClientRect().width;

/**
 * The width a group needs: its children side by side at its own gap, however wide the
 * group is drawn. A child that is not drawn takes no room and no gap.
 */
const packedWidth = (group: HTMLElement | null) => {
  if (!group) return 0;
  const widths = [...group.children].map(widthOf).filter((width) => width > 0);
  const gap = parseFloat(getComputedStyle(group).columnGap) || 0;
  return (
    widths.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, widths.length - 1)
  );
};

/** Widths side by side, `gap` apart, skipping any that are not drawn. */
const lineWidth = (widths: number[], gap: number) => {
  const drawn = widths.filter((width) => width > 0);
  return (
    drawn.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, drawn.length - 1)
  );
};

/**
 * The arrangement the toolbar is drawn in: on a phone always `stacked`, and anywhere else
 * the one with the fewest lines that fits.
 *
 * Measured rather than set at fixed breakpoints because what has to fit changes with more
 * than the window: an agent has no actions and no events switch, so their toolbar fits on
 * one line where an admin's needs two, and select mode adds five buttons to the actions.
 * Breakpoints tuned to one of those would wrap the others again.
 *
 * Groups are measured from their children, which keep their own width in every layout —
 * so a group stretched across its line still measures at what it needs, and the answer
 * never depends on the layout it was measured in. The children are wrappers that are
 * always mounted, even around admin-only controls, so the observer set up once sees every
 * change in what they hold.
 */
export const useToolbarLayout = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ToolbarLayout>(
    IS_PHONE ? "stacked" : "one-line"
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (IS_PHONE || !root) return;
    const groups = [timeRef.current, viewRef.current, actionsRef.current];

    const measure = () => {
      const [time, view, actions] = groups.map(packedWidth);
      const gap = parseFloat(getComputedStyle(root).columnGap) || 0;
      // Half a pixel of slack: widths are fractional, and a line that fits exactly must
      // not round itself onto the next layout.
      const fits = (width: number) => width <= root.clientWidth + 0.5;

      setLayout(
        fits(lineWidth([time, view, actions], gap))
          ? "one-line"
          : fits(lineWidth([time, actions], gap)) && fits(view)
            ? "two-line"
            : "stacked"
      );
    };

    measure();
    // Sizes are reported after layout and before paint. Rendering the new layout right
    // there, rather than on React's next tick, keeps the old one from showing for a
    // frame — entering select mode at the edge of a layout would otherwise flash a wrap.
    const observer = new ResizeObserver(() => flushSync(measure));
    observer.observe(root);
    for (const group of groups) {
      for (const child of group?.children ?? []) observer.observe(child);
    }
    return () => observer.disconnect();
  }, []);

  return { layout, rootRef, timeRef, viewRef, actionsRef };
};
