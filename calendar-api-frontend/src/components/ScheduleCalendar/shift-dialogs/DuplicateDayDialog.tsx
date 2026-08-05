import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { formatDateParam, parseDateParam } from "@/utils/utils";
import { isOffDutyPosition, startOfLocalDay } from "../scheduleUtils";
import { initialsOf } from "./shiftPlanning";
import {
  DuplicateMode,
  duplicateShifts,
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
  const { shifts } = useSchedule();

  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [month, setMonth] = useState<Date>(selectedDate);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [mode, setMode] = useState<DuplicateMode>("skip");
  const [includeOffDuty, setIncludeOffDuty] = useState(true);
  const [busyDays, setBusyDays] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

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
    setSelectedDays([]);
    setMonth(selectedDate);
    setUserIds(allUsers.map((user) => String(user.id)));
    setMode("skip");
    setIncludeOffDuty(true);
  }, [open, selectedDate, allUsers]);

  /**
   * Which days in view already have shifts. Fetched per displayed month so the calendar
   * can warn before a copy rather than after it — the whole reason this dialog needs a
   * calendar instead of a text field.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    // A month grid shows a few days either side, so widen the window to match.
    const start = addDays(from, -7);
    const end = addDays(new Date(month.getFullYear(), month.getMonth() + 1, 1), 7);

    fetchShiftsBetween(start, end)
      .then((found) => {
        if (cancelled) return;
        setBusyDays(
          new Set(found.map((shift) => formatDateParam(new Date(shift.startTime))))
        );
      })
      .catch(() => {
        // A failed probe only costs the warning markers; copying still works.
        if (!cancelled) setBusyDays(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [open, month.getFullYear(), month.getMonth()]);

  const countsShift = (positionId: string) =>
    includeOffDuty || !offDutyPositionIds.includes(String(positionId));

  const countFor = (userId: string) =>
    (shifts[userId] ?? []).filter((shift) => countsShift(String(shift.positionId)))
      .length;

  const sourceSummary = useMemo(() => {
    const all = Object.values(shifts).flat();
    const counted = all.filter((shift) => countsShift(String(shift.positionId)));
    const agents = new Set(counted.map((shift) => String(shift.userId)));
    const positions = new Set(counted.map((shift) => String(shift.positionId)));
    return `${counted.length} shift${counted.length === 1 ? "" : "s"} · ${
      agents.size
    } agent${agents.size === 1 ? "" : "s"} · ${positions.size} position${
      positions.size === 1 ? "" : "s"
    }`;
  }, [shifts, includeOffDuty, offDutyPositionIds]);

  const perDay = useMemo(
    () => userIds.reduce((total, userId) => total + countFor(userId), 0),
    [userIds, shifts, includeOffDuty, offDutyPositionIds]
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
    () =>
      Array.from(busyDays)
        .filter((day) => !selectedDays.includes(day))
        .map((day) => parseDateParam(day))
        .filter((date): date is Date => date !== null),
    [busyDays, selectedDays]
  );

  const weekdayName = selectedDate.toLocaleDateString("en-US", { weekday: "long" });
  const presets = [
    {
      label: `Next ${weekdayName}`,
      dates: () => [nextWeekday(selectedDate, selectedDate.getDay())],
    },
    {
      label: "Next week, Mon–Fri",
      dates: () => {
        const monday = nextWeekday(selectedDate, 1);
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
            cursor.getDay() === selectedDate.getDay() &&
            formatDateParam(cursor) !== formatDateParam(selectedDate)
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
    if (userIds.length === 0) return toast.error("Pick at least one agent");

    setSubmitting(true);
    try {
      const result = await duplicateShifts({
        sourceDate: startOfLocalDay(selectedDate).toISOString(),
        targetDates: selectedDays.map(
          (day) => parseDateParam(day)!.toISOString()
        ),
        users: userIds,
        mode,
        excludePositionIds: includeOffDuty ? [] : offDutyPositionIds,
      });

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
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to duplicate shifts"
      );
    } finally {
      setSubmitting(false);
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
              <div className="flex h-[38px] items-center gap-[9px] rounded-[9px] border border-border px-3">
                <CalendarDays size={14} className="shrink-0 text-muted-foreground" />
                <div className="truncate text-[13px] font-semibold">
                  {selectedDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
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
                  className="p-2"
                  classNames={{
                    month: "flex w-full flex-col gap-2",
                    month_caption:
                      "relative mx-8 flex h-6 items-center justify-center",
                    caption_label: "text-[12.5px] font-semibold",
                    button_previous:
                      "size-6 rounded-md p-0 opacity-60 hover:bg-muted hover:opacity-100",
                    button_next:
                      "size-6 rounded-md p-0 opacity-60 hover:bg-muted hover:opacity-100",
                    week: "mt-0.5 flex w-full",
                    weekday:
                      "w-8 text-[9.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground",
                    day: "size-8 p-0 text-center",
                    day_button:
                      "size-8 rounded-[7px] p-0 text-[11.5px] tabular-nums hover:bg-muted",
                    today: "[&>button]:underline",
                    outside: "text-muted-foreground opacity-40",
                  }}
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
                {userIds.length === allUsers.length
                  ? `all ${allUsers.length} agents come along`
                  : `${userIds.length} of ${allUsers.length} selected`}
              </div>
              <button
                type="button"
                className="whitespace-nowrap text-[12px] font-semibold text-primary hover:underline"
                onClick={() =>
                  setUserIds(
                    userIds.length === allUsers.length
                      ? []
                      : allUsers.map((user) => String(user.id))
                  )
                }
              >
                {userIds.length === allUsers.length ? "Clear all" : "Select all"}
              </button>
            </div>

            <div className="flex flex-wrap content-start gap-1.5 px-4 py-3">
              {allUsers.map((user) => {
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
                    } on ${selectedDate.toLocaleDateString("en-US", {
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
              {perDay} shift{perDay === 1 ? "" : "s"} per day · {userIds.length}{" "}
              agent{userIds.length === 1 ? "" : "s"}
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
            disabled={submitting || created === 0}
            onClick={handleSubmit}
          >
            {submitting
              ? "Duplicating…"
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
