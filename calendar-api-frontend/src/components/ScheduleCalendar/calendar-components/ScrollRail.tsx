import { forwardRef } from "react";
import { LABEL_COLUMN_PX } from "../scheduleUtils";

type ScrollRailProps = {
  /** The grid track's full width, agent column included. */
  trackWidth: number;
  onScroll: () => void;
};

/**
 * A stand-alone sideways scrollbar for the grid, drawn under the hours only.
 *
 * The rows' own scrollbar spans the whole card, agent column included, and sits at the
 * very bottom of a page that is usually taller than the screen. The grid hides that one and
 * shows this instead, twice: under the pinned coverage rows, so it is in reach wherever the
 * page is scrolled, and under the last agent. Its content is the track minus the agent
 * column, inside a box offset by that column, so its scroll range is the rows' own and a
 * `scrollLeft` copies across one to one.
 */
const ScrollRail = forwardRef<HTMLDivElement, ScrollRailProps>(
  ({ trackWidth, onScroll }, ref) => (
    <div
      ref={ref}
      className="schedule-scrollbar overflow-x-auto overflow-y-hidden"
      style={{ marginLeft: LABEL_COLUMN_PX }}
      onScroll={onScroll}
    >
      <div style={{ width: trackWidth - LABEL_COLUMN_PX, height: 1 }} />
    </div>
  )
);
ScrollRail.displayName = "ScrollRail";

export default ScrollRail;
