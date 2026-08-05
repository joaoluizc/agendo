import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { Shift } from "@/types/shiftTypes";
import { positionDisplay } from "../scheduleUtils";
import TimeRangeStepper from "./TimeRangeStepper";
import PositionCombobox from "./PositionCombobox";
import CoverageStrip from "./CoverageStrip";
import AgentDayStrip from "./AgentDayStrip";
import {
  AgentDay,
  AgentStatus,
  ConflictKind,
  HourRange,
  Resolution,
  agentStatus,
  buildRoster,
  buildStripSeries,
  clampRange,
  defaultResolution,
  formatDuration,
  formatHour,
  formatHourTotal,
  formatRange,
  leadHour,
  meterForPosition,
  rangeToIso,
  resolutionOptions,
  shortfallInRange,
  toneStyle,
} from "./shiftPlanning";
import { applyShiftChanges, createShifts, deleteShift } from "./shiftRequests";

type CreateShiftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  /** Prefill from a clicked empty slot, or from "Add agents" on an existing shift. */
  initialUserId?: string;
  initialRange?: HourRange;
  initialPositionId?: string;
};

type AgentFilter = "all" | "free" | "busy" | "off";

const DURATION_PRESETS = [0.5, 1, 2, 4];

/** `13:00` -> `13`, `13:30` stays — for the tight overlap badge. */
const compactHour = (hour: number) => formatHour(hour).replace(":00", "");

const BADGE_TONE: Record<ConflictKind, string> = {
  clear: "bg-ok-bg text-ok",
  overlap: "bg-warn-bg text-warn",
  same: "bg-muted text-muted-foreground",
  unavailable: "bg-muted text-muted-foreground",
};

const badgeText = (status: AgentStatus, positionLabel: string) => {
  if (status.kind === "same") return `Already on ${positionLabel}`;
  if (status.kind === "unavailable") return "Unavailable";
  if (status.kind === "overlap" && status.reference) {
    return `${status.reference.position.label} ${compactHour(
      status.reference.start
    )}–${compactHour(status.reference.end)}`;
  }
  return "Free";
};

const conflictText = (status: AgentStatus, resolution: Resolution) => {
  if (status.kind === "same" && status.reference) {
    return `Already covered by ${status.reference.position.name} ${formatHour(
      status.reference.start
    )}–${formatHour(status.reference.end)} — nothing to add.`;
  }
  if (status.kind === "unavailable" && status.reference) {
    return `Marked unavailable ${formatHour(
      status.reference.start
    )}–${formatHour(status.reference.end)}.`;
  }
  const what =
    resolution === "replace"
      ? "will be deleted"
      : resolution === "add"
        ? "will stack in the same row"
        : "no shift created";
  const names = status.overlaps.map((span) => span.position.label).join(", ");
  return `Overlaps ${names} — ${what}`;
};

/**
 * Create shifts for one slot and one position, across as many agents as you like.
 *
 * The agent list is the body of this dialog rather than a combobox, because the thing
 * an admin is actually deciding is *who is free*. Every agent carries the hours they
 * already have, what they are doing during the slot, and a strip of their whole day; a
 * conflict is resolved per agent here instead of failing the whole submit; and the
 * coverage meter from Settings shows whether the hour reaches target before you save.
 */
const CreateShiftDialog = ({
  open,
  onOpenChange,
  selectedDate,
  initialUserId,
  initialRange,
  initialPositionId,
}: CreateShiftDialogProps) => {
  const { allUsers, allPositions, coverageMeters } = useUserSettings();
  const { shifts, events, setShifts, setEvents } = useSchedule();

  const [range, setRange] = useState<HourRange>({ start: 9, end: 10 });
  const [positionId, setPositionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [submitting, setSubmitting] = useState(false);

  const positionsById = useMemo(
    () => new Map(allPositions.map((position) => [String(position._id), position])),
    [allPositions]
  );

  const roster = useMemo(
    () => buildRoster(allUsers, shifts, positionsById, selectedDate),
    [allUsers, shifts, positionsById, selectedDate]
  );

  /**
   * Reset on open rather than on mount: the dialog instance outlives a single use (the
   * toolbar keeps one around), and reopening it with the previous slot's conflicts still
   * resolved would silently apply decisions made about a different shift.
   */
  useEffect(() => {
    if (!open) return;
    if (initialRange) {
      setRange(clampRange(initialRange.start, initialRange.end));
    } else {
      // No prefill: the next whole hour, as the old toolbar dialog defaulted to.
      const start = Math.min(23, new Date().getHours() + 1);
      setRange(clampRange(start, start + 1));
    }
    setSelectedIds(initialUserId ? [String(initialUserId)] : []);
    setResolutions({});
    setQuery("");
    setFilter("all");
    setPositionId((current) => {
      if (initialPositionId && positionsById.has(String(initialPositionId))) {
        return String(initialPositionId);
      }
      if (current && positionsById.has(current)) return current;
      // A support scheduler is nearly always filling a channel, so lead with one.
      const channel = allPositions.find(
        (position) => position.type === "live channel"
      );
      return String((channel ?? allPositions[0])?._id ?? "");
    });
  }, [open, initialUserId, initialRange?.start, initialRange?.end, initialPositionId]);

  const position = positionDisplay(positionsById.get(positionId));
  // Memoised because the coverage series keys off it — a fresh object every render would
  // rebuild the whole series on every keystroke in the search box.
  const meterContext = useMemo(
    () => meterForPosition(coverageMeters, positionId),
    [coverageMeters, positionId]
  );
  const duration = range.end - range.start;

  const statuses = useMemo(() => {
    const byAgent = new Map<string, AgentStatus>();
    roster.forEach((agent) =>
      byAgent.set(agent.id, agentStatus(agent, range, positionId))
    );
    return byAgent;
  }, [roster, range, positionId]);

  /**
   * A stored choice only survives while it still means something: nudge the time until
   * an agent is free and their "replace" would otherwise sit there deleting nothing.
   */
  const resolutionFor = (agentId: string): Resolution => {
    const kind = statuses.get(agentId)?.kind ?? "clear";
    if (kind === "clear" || kind === "same") return defaultResolution(kind);
    return resolutions[agentId] ?? defaultResolution(kind);
  };

  const selected = selectedIds.filter((id) => statuses.has(id));
  const creating = selected.filter((id) => resolutionFor(id) !== "skip");
  const replacing = selected.filter((id) => resolutionFor(id) === "replace");
  const skipped = selected.length - creating.length;

  /** Shifts that saving would delete — also excluded from the coverage baseline. */
  const shiftsToRemove = useMemo(() => {
    const out: Shift[] = [];
    replacing.forEach((id) => {
      statuses.get(id)?.overlaps.forEach((span) => out.push(span.shift));
    });
    return out;
  }, [replacing.join(","), statuses]);

  const series = useMemo(() => {
    if (!meterContext) return null;
    return buildStripSeries({
      meter: meterContext.meter,
      roster,
      selectedDate,
      range,
      contributorIds: meterContext.counted ? creating : [],
      removedShiftIds: new Set(shiftsToRemove.map((shift) => shift._id)),
    });
  }, [meterContext, roster, selectedDate, range, creating.join(","), shiftsToRemove]);

  const shortfall = series ? shortfallInRange(series, range) : null;

  const counts = useMemo(() => {
    const tally = { all: roster.length, free: 0, busy: 0, off: 0 };
    roster.forEach((agent) => {
      const kind = statuses.get(agent.id)?.kind;
      if (kind === "clear") tally.free++;
      else if (kind === "unavailable") tally.off++;
      else tally.busy++;
    });
    return tally;
  }, [roster, statuses]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster.filter((agent) => {
      if (needle && !agent.name.toLowerCase().includes(needle)) return false;
      const kind = statuses.get(agent.id)?.kind;
      if (filter === "free") return kind === "clear";
      if (filter === "busy") return kind === "overlap" || kind === "same";
      if (filter === "off") return kind === "unavailable";
      return true;
    });
  }, [roster, statuses, query, filter]);

  const toggleAgent = (agentId: string) =>
    setSelectedIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    );

  /* ---------------------------------------------------------------------- */

  const coverageLine = () => {
    if (!series || !meterContext) return "";
    if (!meterContext.counted) {
      return `${position.name} is not counted by any coverage meter`;
    }
    const name = meterContext.meter.name.toLowerCase();
    if (shortfall) {
      return `${name} still ${shortfall.deficit} short at ${formatHour(
        shortfall.hour
      )}`;
    }
    const hour = leadHour(range);
    return `${name} ${series.base[hour]} → ${
      series.base[hour] + series.delta[hour]
    } of ${series.targets[hour]} target, met`;
  };

  const summaryNote = [
    coverageLine(),
    replacing.length &&
      `${replacing.length} existing ${
        replacing.length === 1 ? "shift" : "shifts"
      } replaced`,
    skipped && `${skipped} skipped`,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleSubmit = async () => {
    if (!positionId) return toast.error("Pick a position first");
    if (creating.length === 0) return toast.error("Pick at least one agent");

    setSubmitting(true);

    // Deletions first: a "replace" that created before deleting would leave both shifts
    // behind if the delete then failed, which is the harder mess to unpick.
    const removed: Shift[] = [];
    for (const shift of shiftsToRemove) {
      try {
        await deleteShift(shift._id);
        removed.push(shift);
      } catch {
        toast.error("Could not remove an overlapping shift", {
          description: "It was left in place; the new shift still stacks on it.",
        });
      }
    }

    try {
      const { created, errors } = await createShifts({
        ...rangeToIso(selectedDate, range),
        userIds: creating,
        positionId,
      });

      const next = applyShiftChanges({ shifts, events, removed, created });
      setShifts(next.shifts);
      setEvents(next.events);

      if (errors.length) {
        toast.error(
          `${errors.length} of ${creating.length} shifts could not be created`,
          { description: errors[0]?.message }
        );
      } else {
        toast.success(
          `${created.length} ${created.length === 1 ? "shift" : "shifts"} created`,
          {
            description: `${position.name} · ${formatRange(range)}${
              removed.length ? ` · ${removed.length} replaced` : ""
            }`,
          }
        );
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create shifts"
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------------- */

  const filterTabs: { key: AgentFilter; label: string }[] = [
    { key: "all", label: `All ${counts.all}` },
    { key: "free", label: `Free ${counts.free}` },
    { key: "busy", label: `Busy ${counts.busy}` },
    { key: "off", label: `Off ${counts.off}` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[720px] max-h-[92vh] w-[calc(100vw-32px)] max-w-[980px] flex-col gap-0 overflow-hidden rounded-[14px] p-0">
        <div className="flex items-start gap-3 border-b border-border px-5 pb-[15px] pt-[17px]">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em]">
              New shift
            </DialogTitle>
            <DialogDescription className="mt-[3px] text-[12.5px]">
              One time slot, one position, as many agents as you need.{" "}
              {selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              .
            </DialogDescription>
          </div>
          {/* The day comes from the page, not from this dialog. Letting it drift is how
              the old dialog managed to create shifts you could not then see. */}
          <div className="mr-7 flex h-[30px] shrink-0 items-center gap-[7px] rounded-lg border border-border px-2.5 text-[12.5px] font-medium text-muted-foreground">
            <CalendarDays size={13} />
            {selectedDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[344px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-[17px] overflow-y-auto border-b border-border px-[18px] pb-[18px] pt-4 md:border-b-0 md:border-r">
            <div className="flex flex-col gap-[9px]">
              <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                Time
              </div>
              <TimeRangeStepper
                range={range}
                onChange={setRange}
                presets={DURATION_PRESETS}
              />
            </div>

            {series && meterContext && (
              <CoverageStrip
                series={series}
                range={range}
                meterName={meterContext.meter.name}
                meterColor={meterContext.meter.color}
                counted={meterContext.counted}
                hint="click to move"
                showKey
                onPickHour={(hour) =>
                  setRange(clampRange(hour, hour + duration))
                }
              />
            )}

            <div className="flex flex-col gap-[9px]">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                  Position
                </div>
                <div className="whitespace-nowrap text-[10.5px] text-muted-foreground">
                  {allPositions.length} positions
                </div>
              </div>
              <PositionCombobox
                positions={allPositions}
                value={positionId}
                onChange={(next) => {
                  setPositionId(next);
                  // Conflicts are position-specific — an "already on Chats" decision
                  // means nothing once the position is Tickets.
                  setResolutions({});
                }}
                meters={coverageMeters}
              />
              <div className="flex items-center gap-[9px] pt-0.5">
                <div
                  className="flex shrink-0 flex-col justify-center whitespace-nowrap rounded-md px-2.5 py-[5px] leading-[1.3]"
                  style={toneStyle(position)}
                >
                  <div className="text-[11px] font-bold tabular-nums">
                    {formatRange(range)}
                  </div>
                  <div className="text-[10.5px] font-medium opacity-90">
                    {position.label}
                  </div>
                </div>
                <div className="text-[11px] leading-[1.35] text-muted-foreground">
                  How it lands on the grid.{" "}
                  {meterContext?.counted
                    ? `Counts toward ${meterContext.meter.name.toLowerCase()}.`
                    : "Not counted by a coverage meter."}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-[13px]">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search agents"
                  className="h-8 rounded-lg pl-[30px] text-[12.5px]"
                />
              </div>
              <div className="flex h-8 items-center gap-0.5 rounded-[9px] bg-muted p-0.5">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={filter === tab.key}
                    className={cn(
                      "flex h-7 items-center whitespace-nowrap rounded-[7px] px-2.5 text-[11.5px] font-semibold",
                      filter === tab.key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="shrink-0 whitespace-nowrap px-0.5 text-[12px] font-semibold text-primary hover:underline"
                onClick={() =>
                  setSelectedIds(
                    roster
                      .filter((agent) => statuses.get(agent.id)?.kind === "clear")
                      .map((agent) => agent.id)
                  )
                }
              >
                Select all free ({counts.free})
              </button>
            </div>

            {selected.length > 0 && (
              <div className="flex items-center gap-2 border-b border-border bg-band px-4 py-2.5">
                <div className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  On this shift
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-[5px]">
                  {selected.map((id) => {
                    const agent = roster.find((entry) => entry.id === id);
                    if (!agent) return null;
                    const isSkipped = resolutionFor(id) === "skip";
                    return (
                      <span
                        key={id}
                        className={cn(
                          "flex h-[26px] items-center gap-1.5 rounded-lg border border-border bg-card pl-[3px] pr-[7px] text-[11.5px] font-semibold",
                          isSkipped &&
                            "text-muted-foreground line-through decoration-1"
                        )}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                          {agent.initials}
                        </span>
                        {agent.firstName}
                        <button
                          type="button"
                          aria-label={`Remove ${agent.name}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => toggleAgent(id)}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="whitespace-nowrap text-[11.5px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelectedIds([]);
                    setResolutions({});
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 && (
                <div className="px-4 py-6 text-[12.5px] text-muted-foreground">
                  No agent matches that search.
                </div>
              )}
              {visible.map((agent) => (
                <AgentPickRow
                  key={agent.id}
                  agent={agent}
                  status={statuses.get(agent.id)!}
                  range={range}
                  positionLabel={position.label}
                  isSelected={selected.includes(agent.id)}
                  resolution={resolutionFor(agent.id)}
                  onToggle={() => toggleAgent(agent.id)}
                  onResolve={(value) =>
                    setResolutions((current) => ({
                      ...current,
                      [agent.id]: value,
                    }))
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-border bg-band px-[18px] py-[13px]">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">
              {creating.length === 0
                ? "No shifts to create"
                : `${creating.length} ${
                    creating.length === 1 ? "shift" : "shifts"
                  } · ${position.label} · ${formatRange(range)} · ${formatDuration(
                    duration
                  )}`}
            </div>
            <div
              className={cn(
                "mt-0.5 truncate text-[11.5px]",
                shortfall ? "text-warn" : "text-muted-foreground"
              )}
            >
              {summaryNote}
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
            disabled={submitting || creating.length === 0}
            onClick={handleSubmit}
          >
            {submitting
              ? "Creating…"
              : creating.length === 0
                ? "Create shift"
                : `Create ${creating.length} ${
                    creating.length === 1 ? "shift" : "shifts"
                  }`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* -------------------------------------------------------------------------- */

type AgentPickRowProps = {
  agent: AgentDay;
  status: AgentStatus;
  range: HourRange;
  positionLabel: string;
  isSelected: boolean;
  resolution: Resolution;
  onToggle: () => void;
  onResolve: (resolution: Resolution) => void;
};

const AgentPickRow = ({
  agent,
  status,
  range,
  positionLabel,
  isSelected,
  resolution,
  onToggle,
  onResolve,
}: AgentPickRowProps) => {
  const options = resolutionOptions(status.kind);
  const showResolve = isSelected && status.kind !== "clear";

  return (
    <div
      className={cn(
        "border-b border-border-subtle",
        isSelected && "bg-primary/[0.06] dark:bg-primary/[0.16]",
        status.kind === "same" && !isSelected && "opacity-75"
      )}
    >
      <div
        role="checkbox"
        aria-checked={isSelected}
        aria-label={agent.name}
        tabIndex={0}
        className="flex h-[46px] cursor-pointer items-center gap-2.5 px-4"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <span
          className={cn(
            "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border text-[10.5px] font-bold",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border"
          )}
        >
          {isSelected ? "✓" : ""}
        </span>

        <Avatar className="shrink-0">
          <AvatarImage
            src={agent.user.imageUrl}
            className="h-6 w-6 rounded-full"
          />
          <AvatarFallback className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10.5px] font-semibold text-muted-foreground">
            {agent.initials}
          </AvatarFallback>
        </Avatar>

        <div className="w-[124px] min-w-0">
          <div className="truncate text-[12.5px] font-semibold leading-tight">
            {agent.name}
          </div>
          <div className="truncate text-[10.5px] leading-tight text-muted-foreground">
            {agent.scheduledHours > 0
              ? `${formatHourTotal(agent.scheduledHours)}h scheduled`
              : "nothing scheduled"}
          </div>
        </div>

        <span
          className={cn(
            "hidden w-[132px] shrink-0 truncate rounded-md px-2 text-[10.5px] font-semibold leading-5 sm:block",
            BADGE_TONE[status.kind]
          )}
        >
          {badgeText(status, positionLabel)}
        </span>

        <AgentDayStrip spans={agent.spans} range={range} className="flex-1" />
      </div>

      {showResolve && (
        <div className="flex flex-wrap items-center gap-2.5 px-4 pb-[11px] pl-[62px]">
          <div
            className={cn(
              "text-[11px]",
              status.kind === "same" ? "text-muted-foreground" : "text-warn"
            )}
          >
            {conflictText(status, resolution)}
          </div>
          {options.length > 0 && (
            <div className="flex h-[26px] items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={resolution === option.value}
                  className={cn(
                    "flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold",
                    resolution === option.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onResolve(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CreateShiftDialog;
