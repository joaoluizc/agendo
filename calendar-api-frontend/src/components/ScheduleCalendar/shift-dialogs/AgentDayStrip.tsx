import {
  AgentShiftSpan,
  DAY_HOURS,
  HourRange,
  formatHour,
  stripFill,
} from "./shiftPlanning";

type AgentDayStripProps = {
  spans: AgentShiftSpan[];
  /** Outlined on top of the day, so the slot is read in context. */
  range?: HourRange;
  className?: string;
};

/**
 * One agent's whole day as a 16px bar.
 *
 * The old create dialog reduced each agent to a first name in a combobox, so choosing
 * who works 13:00–14:00 told you nothing about the rest of their day. Here the shape of
 * the day is right next to the checkbox: solid where they are on a channel, pale for
 * supporting work, faint for breaks, with the slot you are filling outlined over it.
 */
const AgentDayStrip = ({ spans, range, className }: AgentDayStripProps) => (
  <div
    className={`relative h-4 min-w-[60px] overflow-hidden rounded-[3px] bg-border-subtle ${
      className ?? ""
    }`}
  >
    {spans.map((span) => (
      <div
        key={span.shift._id}
        className="absolute inset-y-0 border-r border-card"
        title={`${span.position.name} ${formatHour(span.start)}–${formatHour(
          span.end
        )}`}
        style={{
          left: `${(span.start / DAY_HOURS) * 100}%`,
          width: `${((span.end - span.start) / DAY_HOURS) * 100}%`,
          background: stripFill(span.position),
        }}
      />
    ))}

    {range && (
      <div
        className="pointer-events-none absolute inset-y-0 rounded-[3px] border-[1.5px] border-foreground"
        style={{
          left: `${(range.start / DAY_HOURS) * 100}%`,
          width: `${((range.end - range.start) / DAY_HOURS) * 100}%`,
        }}
      />
    )}
  </div>
);

export default AgentDayStrip;
