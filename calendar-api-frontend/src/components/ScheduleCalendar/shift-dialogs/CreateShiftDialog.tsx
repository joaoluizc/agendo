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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { Shift } from "@/types/shiftTypes";
import { Clock, useTimeFormat } from "@/utils/timeFormat";
import { byRecentUse, positionDisplay } from "../scheduleUtils";
import { useAgentLocations } from "@/hooks/useAgentLocations";
import LocationFilter, {
  FILTERABLE_LOCATIONS,
  FLAGS,
} from "../calendar-components/LocationFilter";
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
  byAvailability,
  buildStripSeries,
  clampRange,
  defaultResolution,
  formatDuration,
  formatHourTotal,
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

const DURATION_PRESETS = [0.25, 0.5, 0.75, 1, 2, 4];

const BADGE_TONE: Record<ConflictKind, string> = {
  clear: "bg-ok-bg text-ok",
  overlap: "bg-warn-bg text-warn",
  same: "bg-muted text-muted-foreground",
  unavailable: "bg-muted text-muted-foreground",
};

/**
 * `Ana` · `Ana and Bruno` · `Ana, Bruno and Carla` · `Ana, Bruno, Carla and 2 more`.
 *
 * Capped at three because this reads on one hover: naming nineteen agents would be a
 * paragraph, and past three the count is the useful part anyway.
 */
const joinNames = (names: string[]): string => {
  if (names.length <= 1) return names[0] ?? "";
  const head = names.slice(0, 3);
  if (names.length > 3) {
    return `${head.join(", ")} and ${names.length - 3} more`;
  }
  return `${head.slice(0, -1).join(", ")} and ${head[head.length - 1]}`;
};

const badgeText = (
  status: AgentStatus,
  positionLabel: string,
  clock: Clock
) => {
  if (status.kind === "same") return `Already on ${positionLabel}`;
  if (status.kind === "unavailable") return "Unavailable";
  if (status.kind === "overlap" && status.reference) {
    // Tight, so `Chats 13–14:30` fits the 132px badge.
    return `${status.reference.position.label} ${clock.hourRange(
      status.reference,
      { tight: true }
    )}`;
  }
  return "Free";
};

const conflictText = (
  status: AgentStatus,
  resolution: Resolution,
  clock: Clock
) => {
  if (status.kind === "same" && status.reference) {
    return `Already covered by ${status.reference.position.name} ${clock.hourRange(
      status.reference
    )} — nothing to add.`;
  }
  if (status.kind === "unavailable" && status.reference) {
    return `Marked unavailable ${clock.hourRange(status.reference)}.`;
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
  const { allUsers, allPositions, coverageMeters, markPositionUsed } =
    useUserSettings();
  const { shifts, events, setShifts, setEvents } = useSchedule();
  const { clock } = useTimeFormat();

  /**
   * The slot to open on: the clicked hour, or the next whole hour when there is no prefill.
   *
   * Also used to seed the state below, so the very first render is already right. It used
   * to be a hardcoded `{ start: 9, end: 10 }` corrected by an effect, which meant 09:00 was
   * what you saw if the effect had not run yet — and 09:00 for a click at 11:00 is
   * indistinguishable from a bug.
   */
  const openingRange = (): HourRange => {
    if (initialRange) return clampRange(initialRange.start, initialRange.end);
    const start = Math.min(23, new Date().getHours() + 1);
    return clampRange(start, start + 1);
  };

  /**
   * Which position to preselect.
   *
   * Follows the picker's own order — most recently used first — so the position you reached
   * for last time is already selected. Until something has been used they all tie at
   * "never", and alphabetical-first would land on "1:1"; lead with a live channel in that
   * case, which is what a support scheduler is nearly always filling.
   */
  const openingPositionId = (): string => {
    if (initialPositionId) {
      const prefilled = allPositions.find(
        (position) => String(position._id) === String(initialPositionId)
      );
      if (prefilled) return String(prefilled._id);
    }
    const [mostRecent] = [...allPositions].sort(byRecentUse);
    if (mostRecent?.lastUsedAt) return String(mostRecent._id);
    const channel = allPositions.find(
      (position) => position.type === "live channel"
    );
    return String((channel ?? allPositions[0])?._id ?? "");
  };

  const [range, setRange] = useState<HourRange>(openingRange);
  const [positionId, setPositionId] = useState(openingPositionId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgentFilter>("all");
  /**
   * Which locations' agents are offered. A filter only — it never selects or deselects
   * anyone — and whoever is selected stays listed whatever it shows (`pinned`, snapshotted
   * at each flag change so an agent you untick stays put until the flags change again).
   * Same rule as the duplicate dialog's flags after their first click.
   */
  const [locationFilter, setLocationFilter] = useState<string[]>([
    ...FILTERABLE_LOCATIONS,
  ]);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const { agentsByLocation, filterByLocations, locationByUserId } =
    useAgentLocations();
  /** The agent's location flag, for the list — which, unlike the duplicate dialog's, is
   *  sorted by availability rather than grouped by place. */
  const flagFor = (agentId: string) =>
    FLAGS.find((flag) => flag.location === locationByUserId.get(agentId));
  const [submitting, setSubmitting] = useState(false);
  // Off by default: a new shift is a draft unless you say otherwise, so the reviewable
  // outcome is the one you get without thinking about it.
  const [publishNow, setPublishNow] = useState(false);

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
    // Same two helpers that seeded the initial state, so an open and a re-open cannot
    // disagree about where the dialog starts.
    setRange(openingRange());
    setPositionId(openingPositionId());
    setSelectedIds(initialUserId ? [String(initialUserId)] : []);
    setResolutions({});
    setQuery("");
    setFilter("all");
    setLocationFilter([...FILTERABLE_LOCATIONS]);
    setPinned(new Set());
    setPublishNow(false);
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
    if (kind === "clear" || kind === "same")
      return defaultResolution(kind, publishNow);
    return resolutions[agentId] ?? defaultResolution(kind, publishNow);
  };

  const selected = selectedIds.filter((id) => statuses.has(id));
  const creating = selected.filter((id) => resolutionFor(id) !== "skip");
  const replacing = selected.filter((id) => resolutionFor(id) === "replace");
  const skipped = selected.length - creating.length;

  /**
   * Why the create button is doing nothing, in the dialog's own words — or null when it is
   * not.
   *
   * A disabled button that does not say what is holding it is the whole problem here: the
   * agents in the way are somewhere in a scrolling list, and the way out is a toggle on
   * their row that is easy to miss. Split by kind, because the two have different answers —
   * an unavailable agent can be scheduled anyway or left as a draft, while an agent who
   * already has this shift has nothing to resolve.
   */
  const blockedBy = (): { reason: string; fix?: string } | null => {
    if (selected.length === 0) return { reason: "Select at least one agent." };
    if (creating.length > 0) return null;

    const namesFor = (kind: ConflictKind) =>
      selected
        .filter(
          (id) =>
            statuses.get(id)?.kind === kind && resolutionFor(id) === "skip"
        )
        .map((id) => roster.find((agent) => agent.id === id)?.firstName ?? "")
        .filter(Boolean);

    const unavailable = namesFor("unavailable");
    if (unavailable.length) {
      return {
        reason: `${joinNames(unavailable)} ${
          unavailable.length === 1 ? "is" : "are"
        } marked unavailable`,
        fix: "Pick Schedule anyway, or uncheck Publish now to save it as a draft.",
      };
    }

    const already = namesFor("same");
    if (already.length) {
      return {
        reason: `${joinNames(already)} already ${
          already.length === 1 ? "has" : "have"
        } this shift.`,
      };
    }

    return { reason: "Nothing to create for the agents selected." };
  };

  const blocked = blockedBy();

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

  /** The roster the location flags leave on offer, plus everyone pinned. */
  const located = useMemo(() => {
    const inLocations = new Set(
      filterByLocations(roster, locationFilter).map((agent) => agent.id)
    );
    return roster.filter((agent) => inLocations.has(agent.id) || pinned.has(agent.id));
  }, [roster, filterByLocations, locationFilter, pinned]);

  const changeLocations = (next: string[]) => {
    setLocationFilter(next);
    setPinned(new Set(selectedIds));
  };

  const counts = useMemo(() => {
    const tally = { all: located.length, free: 0, busy: 0, off: 0 };
    located.forEach((agent) => {
      const kind = statuses.get(agent.id)?.kind;
      if (kind === "clear") tally.free++;
      else if (kind === "unavailable") tally.off++;
      else tally.busy++;
    });
    return tally;
  }, [located, statuses]);

  /**
   * Ordered by who can actually take the shift, not alphabetically: free agents, then
   * anyone already on this position over this slot, then everyone with a conflict. The
   * list is long enough that the person you want is otherwise found by reading badges.
   *
   * Sorted after filtering rather than in `buildRoster`, because the order depends on the
   * time range and the position — both of which change while the dialog is open.
   */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return located
      .filter((agent) => {
        if (needle && !agent.name.toLowerCase().includes(needle)) return false;
        const kind = statuses.get(agent.id)?.kind;
        if (filter === "free") return kind === "clear";
        if (filter === "busy") return kind === "overlap" || kind === "same";
        if (filter === "off") return kind === "unavailable";
        return true;
      })
      .sort(byAvailability(statuses));
  }, [located, statuses, query, filter]);

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
      return `${name} still ${shortfall.deficit} short at ${clock.hour(
        shortfall.hour
      )}`;
    }
    const hour = leadHour(range);
    return `${name} ${series.base[hour]} → ${
      series.base[hour] + series.delta[hour]
    } of ${series.targets[hour]} target, met`;
  };

  // With nothing to create, the reason replaces the rest of the line: a disabled button
  // cannot be focused, so the tooltip explaining it is unreachable by keyboard and this is
  // the only place that says it out loud. "3 skipped" was true and told you nothing.
  const summaryNote =
    selected.length > 0 && creating.length === 0 && blocked
      ? [blocked.reason, blocked.fix].filter(Boolean).join(" ")
      : [
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
        status: publishNow ? "published" : "draft",
      });

      const next = applyShiftChanges({ shifts, events, removed, created });
      setShifts(next.shifts);
      setEvents(next.events);

      // Mirror the backend's usage stamp so this position leads the picker on the next
      // shift, without waiting for a page reload to refetch the list.
      if (created.length > 0) markPositionUsed(positionId);

      if (errors.length) {
        toast.error(
          `${errors.length} of ${creating.length} shifts could not be created`,
          { description: errors[0]?.message }
        );
      } else {
        toast.success(
          `${created.length} ${created.length === 1 ? "shift" : "shifts"} created`,
          {
            description: `${position.name} · ${clock.hourRange(range)}${
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

  const createDisabled = submitting || creating.length === 0;

  const createButtonBase = (
    <Button
      className={cn(
        "h-[34px] rounded-lg px-[15px] text-[13px] font-semibold",
        // Hover has to reach the tooltip's wrapper span below, and a disabled button is
        // already inert — saying so lets the span take the pointer.
        createDisabled && "pointer-events-none"
      )}
      disabled={createDisabled}
      onClick={handleSubmit}
    >
      {submitting
        ? publishNow
          ? "Publishing…"
          : "Creating…"
        : creating.length === 0
          ? publishNow
            ? "Create & publish"
            : "Create draft"
          : `${publishNow ? "Create & publish" : "Create"} ${creating.length} ${
              creating.length === 1 ? "shift" : "shifts"
            }`}
    </Button>
  );

  /**
   * The button, wrapped in its explanation when it is refusing to do anything.
   *
   * The wrapper span is load-bearing: a disabled button fires no pointer events, so a
   * tooltip trigger placed on it never opens — hovering has to land on something enabled.
   * The button inside it is inert either way, which is what `pointer-events-none` says.
   */
  const createButton =
    createDisabled && blocked ? (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{createButtonBase}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[260px]">
            <p>{blocked.reason}</p>
            {blocked.fix && (
              <p className="mt-1 text-primary-foreground/70">{blocked.fix}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      createButtonBase
    );

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
                anchorDate={selectedDate}
              />
            </div>

            {series && meterContext && (
              <CoverageStrip
                series={series}
                range={range}
                meterName={meterContext.meter.name}
                meterColor={meterContext.meter.color}
                counted={meterContext.counted}
                hint="drag to move or resize"
                showKey
                onRangeChange={setRange}
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
                    {clock.hourRange(range)}
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
                // Adds the free agents in the chosen locations and keeps everyone already
                // picked, so "all free in APAC" can be added to a pick from elsewhere.
                onClick={() =>
                  setSelectedIds((current) => [
                    ...new Set([
                      ...current,
                      ...located
                        .filter((agent) => statuses.get(agent.id)?.kind === "clear")
                        .map((agent) => agent.id),
                    ]),
                  ])
                }
              >
                Select all free ({counts.free})
              </button>
            </div>

            <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
              <LocationFilter
                selected={locationFilter}
                onChange={changeLocations}
                countsByLocation={agentsByLocation}
              />
              <div className="text-[11px] text-muted-foreground">
                Filters who is listed — anyone selected stays
              </div>
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
                  location={flagFor(agent.id)}
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
                  } · ${position.label} · ${clock.hourRange(range)} · ${formatDuration(
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
          {/* Skips the draft step entirely: the shift is created published and synced in
              the same request. Sits next to the create button because it changes what that
              button does, and its label spells out the consequence — "publish now" alone
              would not tell you a calendar event is about to appear. */}
          <label className="flex shrink-0 cursor-pointer items-center gap-2 pr-1 text-[12.5px] text-muted-foreground">
            <Checkbox
              id="publish-now"
              checked={publishNow}
              onCheckedChange={(checked) => setPublishNow(checked as boolean)}
            />
            Publish now
          </label>
          <Button
            variant="outline"
            className="h-[34px] rounded-lg px-3.5 text-[13px] font-medium"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {createButton}
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
  location?: (typeof FLAGS)[number];
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
  location,
  isSelected,
  resolution,
  onToggle,
  onResolve,
}: AgentPickRowProps) => {
  const { clock } = useTimeFormat();
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
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-semibold leading-tight">
              {agent.name}
            </span>
            {location && (
              <span title={location.label} className="flex shrink-0">
                <location.Flag className="h-[9px] w-[13px] rounded-[1.5px] ring-1 ring-inset ring-foreground/25" />
              </span>
            )}
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
          {badgeText(status, positionLabel, clock)}
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
            {conflictText(status, resolution, clock)}
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
