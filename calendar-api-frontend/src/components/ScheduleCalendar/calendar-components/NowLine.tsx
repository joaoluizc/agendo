import { useEffect, useState } from "react";
import { LABEL_COLUMN_PX } from "../scheduleUtils";

type NowLineProps = {
  /** Only drawn when the grid is showing today. */
  isToday: boolean;
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
const NowLine = ({ isToday }: NowLineProps) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!isToday) return null;

  const fractionOfDay =
    (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const label = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-[5] w-[2px] bg-warn"
      style={{
        left: `calc(${LABEL_COLUMN_PX}px + (100% - ${LABEL_COLUMN_PX}px) * ${fractionOfDay})`,
      }}
    >
      <div className="absolute -left-[22px] top-0 rounded-[5px] bg-warn px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-background">
        {label}
      </div>
    </div>
  );
};

export default NowLine;
