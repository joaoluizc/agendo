import {
  ChevronLeft,
  ChevronRight,
  CalendarSearch,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Label } from "@radix-ui/react-label";
import { Input } from "@/components/ui/input";
import CreateShiftForm from "../CreateShiftBtn";
import DuplicateShifts from "../DuplicateShifts";
import ToggleBulkSelector from "./ToggleBulkSelector";
import { cn } from "@/lib/utils";
import LocationFilter from "./LocationFilter";
import CalendarEventsToggle from "./CalendarEventsToggle";

type ScheduleToolbarProps = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  isToday: boolean;
  /** Refetch the day on screen — used when a duplicate lands on it. */
  onReload: () => void;
  /** Location names whose agents are shown in the grid below. */
  locationFilter: string[];
  onLocationFilterChange: (next: string[]) => void;
  /** Agents per location, for the filter's tooltips. */
  agentsByLocation: Map<string, number>;
  /** Whether the viewer loads Google Calendar events at all (admins only). */
  canShowCalendarEvents: boolean;
  showCalendarEvents: boolean;
  onShowCalendarEventsChange: (next: boolean) => void;
  /** Zoom level: each step in takes two hours off the view, so 0 is the whole day. */
  zoom: number;
  /** The widest level this screen can show — see `minZoom` in ScheduleCalendar. */
  minZoom: number;
  maxZoom: number;
  onZoomChange: (next: number) => void;
  /** A phone-sized screen: the date drops its year to leave room on the first line. */
  compact: boolean;
};

/** A given Date, shifted by `delta` days and normalised to local midnight. */
const addDays = (date: Date, delta: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);

/**
 * `Thu • Aug 27, 2026` — the picker's label, and the only place the day is shown.
 *
 * Month before day, matching every other date in the app (`clock.eventRange`, the duplicate
 * dialog, the reports range). One `toLocaleDateString` call for the date part, so the
 * comma is en-US's own rather than hand-placed; only the weekday and the `•` are joined on.
 *
 * Everything here is fixed-width in characters — three-letter weekday, three-letter month,
 * four-digit year — so the label cannot outgrow the input, which is what stops the picker
 * resizing and shoving the toolbar around as the day changes.
 *
 * A phone drops the year (`Thu • Aug 27`): it is the part you already know, and the width
 * it frees is what keeps the stepper, the date and the zoom on one line.
 */
const weekdayAndDate = (date: Date, withYear = true) => {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  });
  return `${weekday} • ${monthDay}`;
};

/**
 * The schedule's own toolbar.
 *
 * The date stepper is local rather than the shared `DateNavButtons` on purpose:
 * that component is also used by /app/sling-schedule, which this redesign leaves
 * alone. Same behaviour, different chrome.
 */
const ScheduleToolbar = ({
  selectedDate,
  onSelectDate,
  isToday,
  onReload,
  locationFilter,
  onLocationFilterChange,
  agentsByLocation,
  canShowCalendarEvents,
  showCalendarEvents,
  onShowCalendarEventsChange,
  zoom,
  minZoom,
  maxZoom,
  onZoomChange,
  compact,
}: ScheduleToolbarProps) => (
  <div className="px-3 pb-3 pt-3 md:px-5 md:pb-3.5 md:pt-5">
    {/* The label keeps its own line, with every control on the line below — the layout it
        had before, minus the 22px date that used to sit on that second line.
        That date lived in a box padded out to the width of the longest possible date, so
        the stepper beside it would stop sliding on every arrow press; it held still but
        left an obvious gap next to short dates. The day is in the picker now — shown once
        rather than twice, and nothing right of it can move, because the picker is a
        fixed-width input. */}
    <h1 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground max-md:hidden">
      Schedule · Agendo
    </h1>

    {/* Every control here is 34px tall with 13px text and a 16px icon.
        16 rather than the 15 these once declared: the shared `Button` sets
        `[&_svg]:size-4`, and a CSS rule beats an SVG's width/height *attributes*, so any
        icon inside a Button rendered at 16 whatever `size` said. The chevrons and the
        calendar glyph are not inside Buttons — raw <button> and a Label — so they alone
        honoured the 15 and came out a pixel small. Matching the Button default means no
        control needs an override to stay in step.

        On a phone the same controls fit in three lines rather than five: the day, its
        picker and the zoom first, since those are what you reach for on a small screen
        (slightly narrower buttons are what make the three fit a 360px screen), then the
        location filter and events switch (`max-md:order-1`), then the actions on a line of
        their own (`max-md:order-2`, full width), icons at the start and New shift at the
        end, so select mode's extra buttons have room to appear between them. An agent has
        no actions, so that line is dropped rather than left as an empty gap. */}
    <div className="flex flex-wrap items-center gap-2 md:gap-4">
      {/* Prev · Today · Next, glued into one bordered control. */}
      <div className="flex h-[34px] items-stretch overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          aria-label="Previous day"
          className="flex w-8 items-center justify-center hover:bg-muted max-md:w-7"
          onClick={() => onSelectDate(addDays(selectedDate, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        {/* Between the arrows, as the one fixed point you can always get back to. Marked
          when you are already on today so it reads as state rather than a dead button —
          still clickable, since it is harmless and disabling it looks broken. */}
        <button
          type="button"
          aria-current={isToday ? "date" : undefined}
          className={cn(
            "border-x border-border px-3 text-[13px] font-medium hover:bg-muted max-md:px-2.5",
            isToday && "bg-muted text-foreground",
          )}
          onClick={() => onSelectDate(addDays(new Date(), 0))}
        >
          Today
        </button>
        <button
          type="button"
          aria-label="Next day"
          className="flex w-8 items-center justify-center hover:bg-muted max-md:w-7"
          onClick={() => onSelectDate(addDays(selectedDate, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* AirDatepicker attaches to #date — the id has to stay.
        Now the only place the selected day is shown, so it carries the weekday too:
        knowing it is a Thursday matters more than the date itself when you are looking at
        a week's coverage. Wide enough for the longest result ("Sun • Sep 30, 2026", or
        "Sun • Sep 30" on a phone) plus the icon, and fixed, so nothing here shifts as the
        day changes. */}
      <Label htmlFor="date" className="relative flex">
        <Input
          id="date"
          className="h-[34px] w-[132px] cursor-pointer rounded-lg pr-7 text-[13px] font-medium tabular-nums md:w-[168px]"
          placeholder="Select a date"
          value={weekdayAndDate(selectedDate, !compact)}
          readOnly
        />
        <CalendarSearch className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </Label>

      {/* Beside the picker rather than with the actions on the right: this narrows what
          you are looking at, the same way the date does, and neither creates nor changes
          anything. */}
      <div className="max-md:order-1">
        <LocationFilter
          selected={locationFilter}
          onChange={onLocationFilterChange}
          countsByLocation={agentsByLocation}
        />
      </div>

      {/* Glued like the day stepper. Each step in takes two hours off the view, around
          whatever hour is in the middle of it; the ends stay clickable rather than
          disabled, and do nothing. The titles say how much is on screen rather than which
          hours — which hours depends on where the grid is scrolled. */}
      <div className="flex h-[34px] items-stretch overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          aria-label="Zoom out"
          title={`${24 - 2 * zoom}h on screen · zoom out`}
          className="flex w-9 items-center justify-center hover:bg-muted max-md:w-8"
          onClick={() => onZoomChange(Math.max(minZoom, zoom - 1))}
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title={`${24 - 2 * zoom}h on screen · zoom in`}
          className="flex w-9 items-center justify-center border-l border-border hover:bg-muted max-md:w-8"
          onClick={() => onZoomChange(Math.min(maxZoom, zoom + 1))}
        >
          <ZoomIn size={16} />
        </button>
      </div>

      {/* With the filter for the same reason: it changes how the grid reads, not what is
          on it. Admins only, because only admins load the events at all. On a phone it
          ends its line at the right edge, lining up with New shift below. */}
      {canShowCalendarEvents && (
        <div className="max-md:order-1 max-md:ml-auto">
          <CalendarEventsToggle
            checked={showCalendarEvents}
            onCheckedChange={onShowCalendarEventsChange}
          />
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2.5 max-md:order-2 max-md:ml-0 max-md:basis-full max-md:[&:not(:has(button))]:hidden">
        <DuplicateShifts selectedDate={selectedDate} onDuplicated={onReload} />
        <ToggleBulkSelector />
        {/* Pushed to the far end of its own line on a phone, away from the icons. */}
        <div className="max-md:ml-auto">
          <CreateShiftForm selectedDate={selectedDate} />
        </div>
      </div>
    </div>
  </div>
);

export default ScheduleToolbar;
