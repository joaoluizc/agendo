import { Switch } from "@/components/ui/switch";

type CalendarEventsToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
};

/**
 * Show or hide every agent's Google Calendar events on the grid.
 *
 * For reading the shifts on their own — someone unsure when their shift is can switch the
 * meetings off and see where it falls. Hidden events are not fetched at all, and the choice
 * is kept per browser; both live in `ScheduleCalendar`.
 *
 * A switch rather than a menu item, because its position is the state: a grid that has been
 * made quieter on purpose never reads as one that is missing data.
 */
const CalendarEventsToggle = ({
  checked,
  onCheckedChange,
}: CalendarEventsToggleProps) => (
  <label
    className="flex h-[34px] cursor-pointer select-none items-center gap-2 rounded-lg border border-border px-3 text-[13px] font-medium transition-colors hover:bg-muted"
    title={
      checked
        ? "Hide Google Calendar events to see only shifts"
        : "Show each agent's Google Calendar events"
    }
  >
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
    Google Calendar
  </label>
);

export default CalendarEventsToggle;
