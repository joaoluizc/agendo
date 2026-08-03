type ScheduleLegendProps = {
  /** Coverage entries only mean something to an admin, who is the only one who sees the rows. */
  showCoverage: boolean;
  /** Only mention Google Calendar when the under-lane can actually appear. */
  showEvents: boolean;
};

/**
 * Footer inside the grid card. Deliberately no position legend — there are too many
 * positions for one to be useful, and every block carries its full name on hover.
 */
const ScheduleLegend = ({ showCoverage, showEvents }: ScheduleLegendProps) => (
  <div className="flex flex-wrap items-center gap-3.5 border-t border-border bg-band px-4 py-[9px] text-[11px] text-muted-foreground">
    {showEvents && (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-4 rounded-[3px] border border-border bg-muted" />
        Google Calendar
      </span>
    )}
    {showCoverage && (
      <>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-warn" />
          Below target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-3.5 bg-muted-foreground/50" />
          Hourly target
        </span>
        <span className="ml-auto">
          Targets per hour are set in Settings → Coverage
        </span>
      </>
    )}
  </div>
);

export default ScheduleLegend;
