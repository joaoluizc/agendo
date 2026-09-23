import { useEffect, useState } from "react";
import { useTimeFormat } from "@/utils/timeFormat";
import { LABEL_COLUMN_PX } from "../scheduleUtils";

type NowLineProps = {
  /** Only drawn when the grid is showing today. */
  isToday: boolean;
  /**
   * The grid draws the line in two parts — through the pinned hours and coverage rows, and
   * through the agent rows below them — and only the pinned part carries the time, so it
   * stays in view while the page scrolls.
   */
  showLabel?: boolean;
};

/**
 * The "now" marker, absolutely positioned inside the scroll track so it moves with
 * the timeline. Positioned as a percentage of the timeline's width rather than a
 * fixed pixel offset, so it stays correct when the track stretches past its 1500px
 * minimum to fill a wide screen.
 *
 * The offset is the grid's own `LABEL_COLUMN_PX`, not a copy of it. This used to be a
 * hardcoded 252px left over from a wider agent column; once the column shrank to 168px
 * the line drew every minute as if the hours started 84px further right — about 45px
 * (35+ minutes) late by mid-morning.
 */
const NowLine = ({ isToday, showLabel = true }: NowLineProps) => {
  const [now, setNow] = useState(() => new Date());
  const { clock } = useTimeFormat();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!isToday) return null;

  const fractionOfDay =
    (now.getHours() * 60 + now.getMinutes()) / (24 * 60);

  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-[5] w-[2px] bg-warn"
      style={{
        left: `calc(${LABEL_COLUMN_PX}px + (100% - ${LABEL_COLUMN_PX}px) * ${fractionOfDay})`,
      }}
    >
      {/* Centred by its own width rather than a fixed offset, since `10:56 AM` is half as
          wide again as `10:56`. `nowrap` because the 2px line is its containing block:
          without it the label shrinks to its longest word and breaks at the space. */}
      {showLabel && (
        <div className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-warn px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-background">
          {clock.time(now)}
        </div>
      )}
    </div>
  );
};

export default NowLine;
