import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  useDialogContentElement,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { formatDateParam, parseDateParam } from "@/utils/utils";
import { useAgentLocations } from "@/hooks/useAgentLocations";
import { SortedCalendar } from "@/types/shiftTypes";
import LocationFilter, {
  FILTERABLE_LOCATIONS,
} from "../calendar-components/LocationFilter";
import { isOffDutyPosition, startOfLocalDay } from "../scheduleUtils";
import { initialsOf } from "./shiftPlanning";
import {
  BatchProgress,
  DuplicateMode,
  duplicateShiftsByDay,
  fetchShiftsBetween,
} from "./shiftRequests";

type DuplicateDayDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  /** Called when a copy landed on the day currently on screen. */
  onDuplicated: () => void;
};

const addDays = (date: Date, delta: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);

/** The next occurrence of a weekday strictly after `from`. 0 = Sunday. */
const nextWeekday = (from: Date, weekday: number) =>
  addDays(from, ((weekday - from.getDay() + 7) % 7) || 7);

const MODES: { value: DuplicateMode; label: string; hint: string }[] = [
  { value: "skip", label: "Skip", hint: "Leave days that already have shifts untouched" },
  { value: "merge", label: "Add on top", hint: "Copy anyway; shifts stack in the agent's row" },
  {
    value: "replace",
    label: "Replace day",
    hint: "Delete those agents' existing shifts on those days first",
  },
];

/** Shared look for both calendars in this dialog, so the two pickers read as one family. */
const CALENDAR_CLASSNAMES = {
  month: "flex w-full flex-col gap-2",
  month_caption: "relative mx-8 flex h-6 items-center justify-center",
  caption_label: "text-[12.5px] font-semibold",
  button_previous: "size-6 rounded-md p-0 opacity-60 hover:bg-muted hover:opacity-100",
  button_next: "size-6 rounded-md p-0 opacity-60 hover:bg-muted hover:opacity-100",
  week: "mt-0.5 flex w-full",
  weekday:
    "w-8 text-[9.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground",
  day: "size-8 p-0 text-center",
  day_button: "size-8 rounded-[7px] p-0 text-[11.5px] tabular-nums hover:bg-muted",
  today: "[&>button]:underline",
  outside: "text-muted-foreground opacity-40",
  disabled: "opacity-30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
};

/**
 * Which days in and around `month` already have shifts, drafts included. Fetched per
 * displayed month so a calendar can mark them before anything is copied.
 */
const useBusyDays = (enabled: boolean, month: Date) => {
  const [busyDays, setBusyDays] = useState<Set<string>>(new Set());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // A month grid shows a few days either side, so widen the window to match.
    const start = addDays(new Date(year, monthIndex, 1), -7);
    const end = addDays(new Date(year, monthIndex + 1, 1), 7);

    fetchShiftsBetween(start, end)
      .then((found) => {
        if (cancelled) return;
        setBusyDays(
          new Set(found.map((shift) => formatDateParam(new Date(shift.startTime))))
        );
      })
      .catch(() => {
        // A failed probe only costs the markers; copying still works.
        if (!cancelled) setBusyDays(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, year, monthIndex]);

  return busyDays;
};

const toDates = (days: Iterable<string>) =>
  Array.from(days)
    .map((day) => parseDateParam(day))
    .filter((date): date is Date => date !== null);

/**
 * The "Copy from" field. Opens a calendar on click, the same way the schedule's own day
 * field does, and marks the days that have something to copy.
 *
 * Its own component because the popover has to portal into the dialog's content element
 * (see `useDialogContentElement`), and that is only available *below* `DialogContent`.
 */
const SourceDayPicker = ({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) => {
  const container = useDialogContentElement();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(value);
  const busyDays = useBusyDays(open, month);
  const busyDates = useMemo(() => toDates(busyDays), [busyDays]);

  useEffect(() => {
    if (open) setMonth(value);
    // Only on open: re-centring while the user pages through months would fight them.
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change the day to copy from"
          className="flex h-[38px] w-full items-center gap-[9px] rounded-[9px] border border-border px-3 text-left hover:bg-muted"
        >
          <CalendarDays size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-[13px] font-semibold">
            {value.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <ChevronDown size={14} className="ml-auto shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent container={container} align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          weekStartsOn={1}
          month={month}
          onMonthChange={setMonth}
          selected={value}
          onSelect={(date) => {
            if (!date) return;
            onChange(date);
            setOpen(false);
          }}
          modifiers={{ hasShifts: busyDates }}
          // Here a day with shifts is the useful kind — there is something to copy — so
          // it gets a quiet tint rather than the target calendar's warning colour.
          modifiersClassNames={{
            hasShifts: "[&>button]:bg-primary/10 [&>button]:font-semibold",
          }}
          className="p-2"
          classNames={CALENDAR_CLASSNAMES}
        />
      </PopoverContent>
    </Popover>
  );
};

/**
 * Copy a day onto any number of other days.
 *
 * The old dialog was two free-text date fields and a name-only user combobox: one target
 * day per run, no idea whether that day already had shifts, no way to leave breaks
 * behind, and it did not refresh the grid afterwards — so copying into the day you were
 * looking at appeared to do nothing. Here the target is a real calendar that marks the
 * days already carrying shifts, and the days that clash get an explicit decision.
 */
const DuplicateDayDialog = ({
  open,
  onOpenChange,
  selectedDate,
  onDuplicated,
}: DuplicateDayDialogProps) => {
  const { allUsers, allPositions } = useUserSettings();
  const { shifts, exitBulkSelect } = useSchedule();
  const { agentsByLocation, filterByLocations } = useAgentLocations();

  const [sourceDate, setSourceDate] = useState<Date>(selectedDate);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [month, setMonth] = useState<Date>(selectedDate);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([
    ...FILTERABLE_LOCATIONS,
  ]);
  const [mode, setMode] = useState<DuplicateMode>("skip");
  const [includeOffDuty, setIncludeOffDuty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const busyDays = useBusyDays(open, month);

  /** Breaks, meetings and unavailable blocks — what the checkbox leaves behind. */
  const offDutyPositionIds = useMemo(
    () =>
      allPositions
        .filter((position) => isOffDutyPosition(position))
        .map((position) => String(position._id)),
    [allPositions]
  );

  useEffect(() => {
    if (!open) return;
    setSourceDate(selectedDate);
    setSelectedDays([]);
    setMonth(selectedDate);
    setUserIds(allUsers.map((user) => String(user.id)));
    setLocationFilter([...FILTERABLE_LOCATIONS]);
    setMode("skip");
    setIncludeOffDuty(true);
  }, [open, selectedDate, allUsers]);

  const sourceKey = formatDateParam(sourceDate);
  const sourceIsOnScreen = sourceKey === formatDateParam(selectedDate);

  /**
   * The source day's shifts, drafts included — for the per-agent counts and the summary.
   * The day on screen is already loaded, so only another day needs a fetch. Keyed by day
   * so a slow answer for a day the user has already moved off cannot land on the new one.
   */
  const [fetchedSource, setFetchedSource] = useState<{
    key: string;
    byUser: SortedCalendar;
  } | null>(null);

  useEffect(() => {
    if (!open || sourceIsOnScreen) return;
    let cancelled = false;
    const start = startOfLocalDay(sourceDate);
    // The same 24-hour, overlap-based window the API copies from, so the counts shown
    // are the shifts that will actually be copied.
    fetchShiftsBetween(start, addDays(start, 1))
      .then((found) => {
        if (cancelled) return;
        const byUser: SortedCalendar = {};
        found.forEach((shift) => {
          const userId = String(shift.userId);
          (byUser[userId] ??= []).push(shift);
        });
        setFetchedSource({ key: sourceKey, byUser });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Could not load that day's shifts");
        setFetchedSource({ key: sourceKey, byUser: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceKey, sourceIsOnScreen]);

  const sourceLoading = !sourceIsOnScreen && fetchedSource?.key !== sourceKey;
  const sourceShifts: SortedCalendar = useMemo(
    () =>
      sourceIsOnScreen
        ? shifts
        : fetchedSource?.key === sourceKey
          ? fetchedSource.byUser
          : {},
    [sourceIsOnScreen, shifts, fetchedSource, sourceKey]
  );

  /** The agents the location flags leave in the list. */
  const visibleAgents = useMemo(
    () => filterByLocations(allUsers, locationFilter),
    [allUsers, filterByLocations, locationFilter]
  );
  /**
   * Who actually comes along: ticked *and* in view. Narrowing the flags already re-ticks
   * to match, so this only guards against a selection outliving its location.
   */
  const chosenIds = useMemo(() => {
    const inView = new Set(visibleAgents.map((user) => String(user.id)));
    return userIds.filter((id) => inView.has(id));
  }, [userIds, visibleAgents]);
  const allVisibleChosen =
    visibleAgents.length > 0 && chosenIds.length === visibleAgents.length;

  /**
   * Picking locations picks their agents. The flags are how you say "copy APAC only";
   * after that, the chips are how you leave one person out.
   */
  const changeLocations = (next: string[]) => {
    setLocationFilter(next);
    setUserIds(filterByLocations(allUsers, next).map((user) => String(user.id)));
  };

  /** A day cannot be copied onto itself, so choosing it as the source drops it as a target. */
  const changeSource = (date: Date) => {
    const key = formatDateParam(date);
    setSourceDate(date);
    setSelectedDays((current) => current.filter((day) => day !== key));
  };

  const countsShift = (positionId: string) =>
    includeOffDuty || !offDutyPositionIds.includes(String(positionId));

  const countFor = (userId: string) =>
    (sourceShifts[userId] ?? []).filter((shift) =>
      countsShift(String(shift.positionId))
    ).length;

  const sourceSummary = useMemo(() => {
    if (sourceLoading) return "Loading that day's shifts…";
    const all = Object.values(sourceShifts).flat();
    const counted = all.filter((shift) => countsShift(String(shift.positionId)));
    const agents = new Set(counted.map((shift) => String(shift.userId)));
    const positions = new Set(counted.map((shift) => String(shift.positionId)));
    return `${counted.length} shift${counted.length === 1 ? "" : "s"} · ${
      agents.size
    } agent${agents.size === 1 ? "" : "s"} · ${positions.size} position${
      positions.size === 1 ? "" : "s"
    }`;
  }, [sourceShifts, sourceLoading, includeOffDuty, offDutyPositionIds]);

  const perDay = useMemo(
    () => chosenIds.reduce((total, userId) => total + countFor(userId), 0),
    [chosenIds, sourceShifts, includeOffDuty, offDutyPositionIds]
  );

  const conflictDays = selectedDays.filter((day) => busyDays.has(day));
  const effectiveDays =
    mode === "skip" ? selectedDays.length - conflictDays.length : selectedDays.length;
  const created = perDay * effectiveDays;

  const selectedDates = useMemo(
    () =>
      selectedDays
        .map((day) => parseDateParam(day))
        .filter((date): date is Date => date !== null),
    [selectedDays]
  );
  // Busy and selected are kept mutually exclusive: both style the day button, and
  // leaving them to overlap would put two competing backgrounds on the same element and
  // let stylesheet order decide which one you see. Selected always wins.
  const busyDates = useMemo(
    () => toDates(Array.from(busyDays).filter((day) => !selectedDays.includes(day))),
    [busyDays, selectedDays]
  );

  const weekdayName = sourceDate.toLocaleDateString("en-US", { weekday: "long" });
  const presets = [
    {
      label: `Next ${weekdayName}`,
      dates: () => [nextWeekday(sourceDate, sourceDate.getDay())],
    },
    {
      label: "Next week, Mon–Fri",
      dates: () => {
        const monday = nextWeekday(sourceDate, 1);
        return Array.from({ length: 5 }, (_, index) => addDays(monday, index));
      },
    },
    {
      label: `Every ${weekdayName} in ${month.toLocaleDateString("en-US", {
        month: "long",
      })}`,
      dates: () => {
        const out: Date[] = [];
        const cursor = new Date(month.getFullYear(), month.getMonth(), 1);
        while (cursor.getMonth() === month.getMonth()) {
          if (
            cursor.getDay() === sourceDate.getDay() &&
            formatDateParam(cursor) !== sourceKey
          ) {
            out.push(new Date(cursor));
          }
          cursor.setDate(cursor.getDate() + 1);
        }
        return out;
      },
    },
  ];

  const toggleUser = (userId: string) =>
    setUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );

  const handleSubmit = async () => {
    if (selectedDays.length === 0) return toast.error("Pick at least one day");
    if (chosenIds.length === 0) return toast.error("Pick at least one agent");

    setSubmitting(true);
    try {
      const result = await duplicateShiftsByDay(
        {
          sourceDate: startOfLocalDay(sourceDate).toISOString(),
          targetDates: selectedDays.map(
            (day) => parseDateParam(day)!.toISOString()
          ),
          users: chosenIds,
          mode,
          excludePositionIds: includeOffDuty ? [] : offDutyPositionIds,
        },
        setProgress
      );

      if (result.errors?.length) {
        toast.error(result.message, {
          description: `${result.errors.length} problem${
            result.errors.length === 1 ? "" : "s"
          }: ${result.errors[0].message}`,
        });
      } else {
        const skipped = result.days.filter((day) => day.status === "skipped").length;
        toast.success(result.message, {
          description: skipped
            ? `${skipped} day${skipped === 1 ? "" : "s"} skipped — already had shifts`
            : undefined,
        });
      }

      // Copying onto the day on screen used to look like a no-op until you navigated
      // away and back.
      if (selectedDays.includes(formatDateParam(selectedDate))) onDuplicated();

      // Leave select-shifts mode, like every other bulk action. This dialog does not read
      // the selection at all — it copies a whole day — but finishing here while still in
      // the mode leaves a selection standing that refers to the day *before* the copy, and
      // that is the state a stale selection needs to do damage.
      exitBulkSelect();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to duplicate shifts"
      );
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-32px)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-[14px] p-0">
        <div className="flex items-start gap-3 border-b border-border px-5 pb-[15px] pt-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em]">
              Duplicate a day
            </DialogTitle>
            <DialogDescription className="mt-[3px] text-[12.5px]">
              Copy {weekdayName}&apos;s shifts onto other days. Pick who comes
              along.
            </DialogDescription>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[300px_minmax(0,1fr)] md:overflow-visible">
          <div className="flex flex-col gap-[15px] border-b border-border px-[18px] pb-[18px] pt-4 md:border-b-0 md:border-r">
            <div className="flex flex-col gap-[7px]">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                Copy from
              </div>
              <SourceDayPicker value={sourceDate} onChange={changeSource} />
              <div className="text-[11.5px] text-muted-foreground">
                {sourceSummary}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                  Copy to
                </div>
                <div className="whitespace-nowrap text-[10.5px] text-muted-foreground">
                  any number of days
                </div>
              </div>
              <div className="rounded-[10px] border border-border">
                <Calendar
                  mode="multiple"
                  weekStartsOn={1}
                  month={month}
                  onMonthChange={setMonth}
                  selected={selectedDates}
                  onSelect={(dates) =>
                    setSelectedDays(
                      (dates ?? []).map((date) => formatDateParam(date)).sort()
                    )
                  }
                  modifiers={{ busy: busyDates }}
                  // Selected days are styled by the shared Calendar's own `selected`
                  // class. A day that already has shifts is the one thing worth flagging
                  // before the copy runs, so it reads as a warning rather than as
                  // decoration — and `[&>button]:` because modifier classes land on the
                  // day cell, not on the button inside it.
                  modifiersClassNames={{
                    busy: "[&>button]:bg-warn-bg [&>button]:text-warn [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-warn/40",
                  }}
                  disabled={sourceDate}
                  className="p-2"
                  classNames={CALENDAR_CLASSNAMES}
                />
              </div>
              <div className="flex flex-wrap gap-[5px]">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="flex h-[26px] items-center whitespace-nowrap rounded-[7px] border border-border px-2.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      const dates = preset.dates();
                      setSelectedDays(dates.map(formatDateParam).sort());
                      if (dates[0]) setMonth(dates[0]);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2.5 border-b border-border px-4 pb-3 pt-[13px]">
              <div className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                Agents
              </div>
              <div className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                {allVisibleChosen
                  ? `all ${visibleAgents.length} agents come along`
                  : `${chosenIds.length} of ${visibleAgents.length} selected`}
              </div>
              <button
                type="button"
                className="whitespace-nowrap text-[12px] font-semibold text-primary hover:underline"
                onClick={() =>
                  setUserIds(
                    allVisibleChosen
                      ? []
                      : visibleAgents.map((user) => String(user.id))
                  )
                }
              >
                {allVisibleChosen ? "Clear all" : "Select all"}
              </button>
            </div>

            <div className="flex items-center gap-2.5 px-4 pt-3">
              <LocationFilter
                selected={locationFilter}
                onChange={changeLocations}
                countsByLocation={agentsByLocation}
              />
              <div className="text-[11px] text-muted-foreground">
                Pick a location to copy only its agents
              </div>
            </div>

            <div className="flex flex-wrap content-start gap-1.5 px-4 py-3">
              {visibleAgents.map((user) => {
                const id = String(user.id);
                const isOn = userIds.includes(id);
                const count = countFor(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isOn}
                    title={`${user.firstName} ${user.lastName} · ${count} shift${
                      count === 1 ? "" : "s"
                    } on ${sourceDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`}
                    className={cn(
                      "flex h-[30px] items-center gap-1.5 rounded-lg border pl-[3px] pr-2.5 text-[12px] font-semibold",
                      isOn
                        ? "border-primary bg-primary/[0.08] text-foreground dark:bg-primary/[0.2]"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => toggleUser(id)}
                  >
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-muted text-[9.5px] font-bold text-muted-foreground">
                      {initialsOf(user)}
                    </span>
                    {user.firstName}
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto flex flex-col gap-2.5 px-4 pb-3.5">
              <div
                className={cn(
                  "flex flex-col gap-2 rounded-[9px] border p-3",
                  conflictDays.length
                    ? "border-warn/40 bg-warn-bg text-warn"
                    : "border-border bg-band text-muted-foreground"
                )}
              >
                <div className="flex items-start gap-2 text-[12px] leading-[1.4]">
                  <Info size={13} className="mt-[2px] shrink-0" />
                  <span>
                    {selectedDays.length === 0
                      ? "Pick the days to copy onto."
                      : conflictDays.length
                        ? `${conflictDays.length} of the days you picked already ${
                            conflictDays.length === 1 ? "has" : "have"
                          } shifts (${conflictDays
                            .map((day) =>
                              parseDateParam(day)!.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            )
                            .join(", ")}).`
                        : "None of the days you picked have shifts yet."}
                  </span>
                </div>
                <div className="flex h-7 items-center gap-0.5 self-start rounded-lg border border-border bg-card p-0.5">
                  {MODES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      title={option.hint}
                      aria-pressed={mode === option.value}
                      className={cn(
                        "flex h-[22px] items-center whitespace-nowrap rounded-md px-2.5 text-[11px] font-semibold",
                        mode === option.value
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setMode(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex w-fit cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={includeOffDuty}
                  onChange={(event) => setIncludeOffDuty(event.target.checked)}
                />
                <span
                  className={cn(
                    "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border text-[10.5px] font-bold",
                    includeOffDuty
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  )}
                >
                  {includeOffDuty ? "✓" : ""}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  Include breaks, meetings and unavailable blocks
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 border-t border-border bg-band px-[18px] py-[13px]">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">
              {created === 0
                ? "Nothing to copy"
                : `${created} shift${created === 1 ? "" : "s"} onto ${effectiveDays} day${
                    effectiveDays === 1 ? "" : "s"
                  }`}
            </div>
            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {perDay} shift{perDay === 1 ? "" : "s"} per day · {chosenIds.length}{" "}
              agent{chosenIds.length === 1 ? "" : "s"}
              {mode === "skip" && conflictDays.length
                ? ` · ${conflictDays.length} day${
                    conflictDays.length === 1 ? "" : "s"
                  } skipped`
                : mode === "replace" && conflictDays.length
                  ? ` · existing shifts on ${conflictDays.length} day${
                      conflictDays.length === 1 ? "" : "s"
                    } deleted`
                  : ""}
            </div>
          </div>
          <Button
            variant="outline"
            className="h-[34px] rounded-lg px-3.5 text-[13px] font-medium"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-[34px] rounded-lg px-[15px] text-[13px] font-semibold"
            disabled={submitting || sourceLoading || created === 0}
            onClick={handleSubmit}
          >
            {submitting
              ? progress && progress.total > 1
                ? `Copying day ${Math.min(progress.done + 1, progress.total)} of ${
                    progress.total
                  }…`
                : "Duplicating…"
              : created === 0
                ? "Duplicate"
                : `Duplicate to ${effectiveDays} day${
                    effectiveDays === 1 ? "" : "s"
                  }`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateDayDialog;
