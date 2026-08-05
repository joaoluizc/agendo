import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import type { Shift } from "@/types/shiftTypes";
import { dayBounds, positionDisplay } from "../scheduleUtils";
import TimeRangeStepper from "./TimeRangeStepper";
import PositionCombobox from "./PositionCombobox";
import CoverageStrip from "./CoverageStrip";
import CreateShiftDialog from "./CreateShiftDialog";
import {
  AgentShiftSpan,
  HourRange,
  buildRoster,
  buildStripSeries,
  formatDuration,
  formatHour,
  formatHourTotal,
  formatRange,
  leadHour,
  meterForPosition,
  rangeToIso,
  toneStyle,
} from "./shiftPlanning";
import { applyShiftChanges, deleteShift, updateShift } from "./shiftRequests";
import { useAgentSyncRules } from "./useAgentSyncRules";

type EditShiftDialogProps = {
  shift: Shift;
  selectedDate: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called only when part of a multi-shift save failed and the day needs resyncing. */
  reloadScheduleCalendar: () => void;
};

/**
 * A Mongo ObjectId's first four bytes are the Unix second it was minted, so a shift
 * carries its own creation time even though the schema has no `createdAt`.
 */
const createdAtFromId = (id: string): Date | null => {
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;
  return new Date(parseInt(id.slice(0, 8), 16) * 1000);
};

/**
 * Edit one shift, with everything the old dialog dropped on the floor.
 *
 * That dialog was four label-and-field rows: start, end, user, position, "Created by X".
 * It could not tell you who else was on the same slot, whether the shift had reached
 * Google Calendar, what deleting it would do to coverage, or what else the agent had on
 * that day — so every one of those questions meant closing the dialog and reading the
 * grid. They are all here now, and a time change can be applied to the whole slot in one
 * go rather than one agent at a time.
 */
const EditShiftDialog = ({
  shift,
  selectedDate,
  open,
  onOpenChange,
  reloadScheduleCalendar,
}: EditShiftDialogProps) => {
  const { allUsers, allPositions, coverageMeters } = useUserSettings();
  const { shifts, events, setShifts, setEvents } = useSchedule();

  const original = useMemo(() => {
    const bounds = dayBounds(shift.startTime, shift.endTime, selectedDate);
    return {
      range: { start: bounds.start, end: bounds.end } as HourRange,
      positionId: String(shift.positionId),
    };
  }, [shift.startTime, shift.endTime, shift.positionId, selectedDate]);

  const [range, setRange] = useState<HourRange>(original.range);
  const [positionId, setPositionId] = useState(original.positionId);
  const [applyAll, setApplyAll] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addAgentsOpen, setAddAgentsOpen] = useState(false);

  const positionsById = useMemo(
    () => new Map(allPositions.map((position) => [String(position._id), position])),
    [allPositions]
  );
  const roster = useMemo(
    () => buildRoster(allUsers, shifts, positionsById, selectedDate),
    [allUsers, shifts, positionsById, selectedDate]
  );

  const agent = roster.find((entry) => entry.id === String(shift.userId));
  const positionRecord = positionsById.get(positionId);
  const position = positionDisplay(positionRecord);
  const originalPositionRecord = positionsById.get(original.positionId);
  const originalPosition = positionDisplay(originalPositionRecord);

  // Whether this shift reaches its owner's calendar is decided per agent, so it takes a
  // read of that agent's own settings. One request per dialog open — the dialog only
  // mounts while it is open, and the hook caches per agent for the session.
  const { rules: syncRules, status: syncRulesStatus } = useAgentSyncRules(
    String(shift.userId)
  );

  const dirty =
    range.start !== original.range.start ||
    range.end !== original.range.end ||
    positionId !== original.positionId;

  // Memoised because the coverage series keys off it — see CreateShiftDialog.
  const meterContext = useMemo(
    () => meterForPosition(coverageMeters, positionId),
    [coverageMeters, positionId]
  );

  /**
   * The baseline excludes this shift, so the strip reads as "everyone else" plus this
   * shift's own contribution on top — which is what makes "delete this and it drops
   * to N" a claim the picture actually supports.
   */
  const series = useMemo(() => {
    if (!meterContext || !agent) return null;
    return buildStripSeries({
      meter: meterContext.meter,
      roster,
      selectedDate,
      range,
      contributorIds: meterContext.counted ? [agent.id] : [],
      removedShiftIds: new Set([shift._id]),
    });
  }, [meterContext, roster, selectedDate, range, agent?.id, shift._id]);

  /** Everyone with a shift on this position overlapping this slot, including this one. */
  const group = useMemo(() => {
    const members: { span: AgentShiftSpan; agentName: string; initials: string }[] = [];
    roster.forEach((entry) =>
      entry.spans.forEach((span) => {
        if (
          span.positionId === positionId &&
          span.start < range.end &&
          span.end > range.start
        ) {
          members.push({
            span,
            agentName: entry.name,
            initials: entry.initials,
          });
        }
      })
    );
    return members.sort((a, b) => a.span.start - b.span.start);
  }, [roster, positionId, range]);

  const others = group.filter((member) => member.span.shift._id !== shift._id);
  const duration = range.end - range.start;
  const leading = leadHour(range);

  const coverageNote = () => {
    if (!series || !meterContext) return "";
    if (!meterContext.counted) {
      return `${position.name} does not count toward any coverage meter.`;
    }
    const name = meterContext.meter.name;
    const without = series.base[leading];
    const total = without + series.delta[leading];
    const target = series.targets[leading];
    if (total < target) {
      return `${name} ${formatHour(leading)} is ${total} of ${target} — still ${
        target - total
      } short.`;
    }
    return `${name} ${formatHour(leading)} is ${total} of ${target}. Delete this and it drops to ${without}${
      without < target ? ", below target." : "."
    }`;
  };

  const coverageIsWarning =
    !!series &&
    !!meterContext?.counted &&
    (series.base[leading] + series.delta[leading] < series.targets[leading] ||
      series.base[leading] < series.targets[leading]);

  const breakSpan = agent?.spans.find(
    (span) => span.position.tone === "quiet" && !span.isUnavailable
  );
  const rowOverlaps =
    agent?.spans.filter(
      (span) =>
        span.shift._id !== shift._id &&
        span.start < range.end &&
        span.end > range.start
    ).length ?? 0;
  const createdAt = createdAtFromId(shift._id);
  const createdByName =
    allUsers.find((user) => String(user.id) === String(shift.createdBy))
      ?.firstName ?? "someone no longer on the roster";

  /**
   * Both steps of the real rule, stated outright.
   *
   * Whether a shift syncs is decided per *agent*, not per position: the backend checks
   * admin enforcement first, and otherwise looks for an entry in that agent's own
   * `positionsToSync` — keyed by `Position.positionId` (the Sling id), not by the `_id`
   * the shift carries. So neither half can be read off `allPositions`. `Position.sync`
   * from `/api/position/all` is not anyone's preference (Settings overwrites it with the
   * *caller's* answer from `/api/position/sync` before showing it), and the preference
   * that decides this belongs to the shift's owner rather than the admin reading the
   * dialog. `/api/position/sync-rules` is the admin-scoped read of exactly that, already
   * resolved against `Position._id` so the id-space bridge stays on the backend.
   */
  const rule = syncRules?.get(positionId);
  const originalRule = syncRules?.get(original.positionId);
  const agentFirstName = agent?.firstName ?? "the agent";
  const enforced = rule?.enforced ?? !!positionRecord?.enforceSync;

  let syncRule: string;
  if (enforced) {
    // Step 1. Enforcement is global, so there is nothing left to look up.
    syncRule = "Enforced by position — always syncs";
  } else if (syncRulesStatus === "loading") {
    syncRule = `Checking ${agentFirstName}'s settings…`;
  } else if (rule) {
    // Step 2. Their own choice — knowable now, rather than merely deferred to.
    syncRule = rule.preference
      ? `${agentFirstName} syncs this position`
      : `${agentFirstName} does not sync this position`;
  } else {
    // The lookup failed, or a position the roster no longer has. Say only what holds.
    syncRule = `Follows ${agentFirstName}'s calendar settings`;
  }

  /**
   * What saving a position change does to the calendar.
   *
   * Lives beside the position control rather than in the detail row because that row
   * truncates at about forty characters, and this is the half an admin most needs to
   * read. `updateShift` deletes the existing event and only re-adds one if the new
   * position still syncs, so a flip takes effect the moment you save.
   */
  const willSync = rule?.willSync ?? enforced;
  const wasSyncing = originalRule?.willSync ?? shift.isSynced;
  const syncFlip =
    positionId === original.positionId || syncRulesStatus !== "ready"
      ? null
      : wasSyncing && !willSync
        ? `Saving removes this shift from ${agentFirstName}'s Google Calendar.`
        : !wasSyncing && willSync
          ? `Saving adds this shift to ${agentFirstName}'s Google Calendar.`
          : null;

  // A position that should have synced but didn't is a failure (revoked Google token, an
  // API error `addEventForShift` swallows), not a preference. Judged against the position
  // as saved, since `isSynced` records what that write achieved — not the pending edit.
  const syncFailed =
    !shift.isSynced &&
    (originalRule ? originalRule.willSync : !!originalPositionRecord?.enforceSync);

  const details: { label: string; value: string; tone?: "ok" | "warn" }[] = [
    { label: "Agent", value: agent?.name ?? "Unknown agent" },
    shift.isSynced && shift.syncedEvent
      ? {
          label: "Google Calendar",
          value: `Synced · “${shift.syncedEvent.summary}”`,
          tone: "ok" as const,
        }
      : {
          label: "Google Calendar",
          value: syncFailed
            ? `Not synced — but ${
                originalRule?.enforced ?? originalPositionRecord?.enforceSync
                  ? "this position is enforced"
                  : `${agentFirstName} syncs this position`
              }`
            : "Not synced",
          ...(syncFailed ? { tone: "warn" as const } : {}),
        },
    {
      label: "Counts toward",
      value: meterContext?.counted
        ? meterContext.meter.name
        : "nothing — not in a meter",
    },
    { label: "Sync rule", value: syncRule },
    {
      label: `Agent's ${selectedDate.toLocaleDateString("en-US", {
        weekday: "long",
      })}`,
      value: `${formatHourTotal(agent?.scheduledHours ?? 0)}h scheduled · break ${
        breakSpan
          ? `${formatHour(breakSpan.start)}–${formatHour(breakSpan.end)}`
          : "none"
      }`,
    },
    {
      label: "Created",
      value: `${createdByName}${
        createdAt
          ? ` · ${createdAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}, ${createdAt.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}`
          : ""
      }`,
    },
    {
      label: "Overlaps",
      value: rowOverlaps
        ? `${rowOverlaps} other ${
            rowOverlaps === 1 ? "shift" : "shifts"
          } in ${agent?.firstName ?? "this"}'s row`
        : `none in ${agent?.firstName ?? "this"}'s row`,
    },
  ];

  /* ---------------------------------------------------------------------- */

  const handleSave = async () => {
    if (!dirty && removedIds.length === 0) return;
    setSaving(true);

    const iso = rangeToIso(selectedDate, range);
    const removed: Shift[] = [];
    const created: Shift[] = [];
    let failures = 0;

    // Removals first, so a slot that is being both trimmed and retimed cannot briefly
    // hold two shifts for the same agent.
    for (const member of others) {
      if (!removedIds.includes(member.span.shift._id)) continue;
      try {
        await deleteShift(member.span.shift._id);
        removed.push(member.span.shift);
      } catch {
        failures++;
      }
    }

    const toUpdate: Shift[] = dirty ? [shift] : [];
    if (dirty && applyAll) {
      others.forEach((member) => {
        if (removedIds.includes(member.span.shift._id)) return;
        toUpdate.push(member.span.shift);
      });
    }

    for (const target of toUpdate) {
      try {
        const updated = await updateShift(target._id, {
          ...iso,
          userId: target.userId,
          positionId,
        });
        // The response carries the fresh sync state, so swapping the whole shift keeps
        // the Google Calendar under-lane honest. Without one, keep the sync state we
        // already had rather than guessing — dropping it would orphan the event.
        removed.push(target);
        created.push(updated ?? { ...target, ...iso, positionId });
      } catch {
        failures++;
      }
    }

    const next = applyShiftChanges({ shifts, events, removed, created });
    setShifts(next.shifts);
    setEvents(next.events);
    setSaving(false);

    if (failures > 0) {
      toast.error(
        `${failures} ${failures === 1 ? "change" : "changes"} could not be saved`
      );
      // A partial batch is the one case worth a refetch — the local patch now describes
      // something the server may not agree with.
      reloadScheduleCalendar();
      return;
    }

    toast.success("Shift updated", {
      description: `${position.name} · ${formatRange(range)}${
        toUpdate.length > 1 ? ` · ${toUpdate.length} agents` : ""
      }${removed.length > toUpdate.length ? ` · ${removedIds.length} removed` : ""}`,
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteShift(shift._id);
      const next = applyShiftChanges({
        shifts,
        events,
        removed: [shift],
        created: [],
      });
      setShifts(next.shifts);
      setEvents(next.events);
      toast.success("Shift deleted");
      onOpenChange(false);
    } catch {
      toast.error("Failed to delete shift");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  /* ---------------------------------------------------------------------- */

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-32px)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-[14px] p-0">
          <div className="flex items-center gap-3 border-b border-border px-5 py-[15px]">
            <Avatar className="shrink-0">
              <AvatarImage
                src={agent?.user.imageUrl}
                className="h-[34px] w-[34px] rounded-full"
              />
              <AvatarFallback className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-muted text-[12.5px] font-semibold text-muted-foreground">
                {agent?.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="whitespace-nowrap text-[16px] font-semibold tracking-[-0.01em]">
                  {agent?.name ?? "Unknown agent"}
                </DialogTitle>
                <span
                  className="flex h-[21px] shrink-0 items-center rounded-md px-2.5 text-[11px] font-semibold"
                  style={toneStyle(position)}
                >
                  {position.name}
                </span>
              </div>
              <DialogDescription className="mt-0.5 text-[12.5px] tabular-nums">
                {formatRange(range)} ·{" "}
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
                {dirty && " · edited"}
              </DialogDescription>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[18px] pt-[17px]">
            <div className="grid grid-cols-1 items-start gap-[18px] sm:grid-cols-[268px_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                  Time
                </div>
                <TimeRangeStepper range={range} onChange={setRange} compact />
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="flex h-[22px] items-center rounded-md bg-muted px-2 font-semibold tabular-nums">
                    {formatDuration(duration)}
                  </span>
                  <span className={dirty ? "text-warn" : "text-muted-foreground"}>
                    {dirty
                      ? `was ${formatRange(original.range)}`
                      : "unchanged"}
                  </span>
                </div>
              </div>

              {series && meterContext ? (
                <div className="flex flex-col gap-2">
                  <CoverageStrip
                    series={series}
                    range={range}
                    meterName={meterContext.meter.name}
                    meterColor={meterContext.meter.color}
                    counted={meterContext.counted}
                    hint="this shift's effect"
                    height={40}
                  />
                  <div
                    className={cn(
                      "text-[11.5px] leading-[1.4]",
                      coverageIsWarning ? "text-warn" : "text-muted-foreground"
                    )}
                  >
                    {coverageNote()}
                  </div>
                </div>
              ) : (
                <div className="text-[11.5px] leading-[1.4] text-muted-foreground">
                  No coverage meters are configured, so nothing measures this shift.
                  Set them up in Settings → Coverage targets.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 items-end gap-[18px] sm:grid-cols-[268px_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
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
                  onChange={setPositionId}
                  meters={coverageMeters}
                />
              </div>
              <div className="pb-2 text-[11.5px] leading-[1.45] text-muted-foreground">
                {positionId === original.positionId
                  ? "Changing the position moves this shift between coverage meters."
                  : `Position changed from ${originalPosition.name}.`}{" "}
                {meterContext?.counted
                  ? `Counts toward ${meterContext.meter.name.toLowerCase()}.`
                  : "Not counted by any meter."}
                {syncFlip && (
                  <>
                    {" "}
                    <span className="font-semibold text-warn">{syncFlip}</span>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-[10px] border border-border">
              <div className="flex items-center gap-2.5 border-b border-border bg-band px-3 py-[11px]">
                <div className="whitespace-nowrap text-[12.5px] font-semibold">
                  {group.length} {group.length === 1 ? "agent" : "agents"} on{" "}
                  {position.label} {formatRange(range)}
                </div>
                <div className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                  {others.length > 0
                    ? "same slot, separate shifts"
                    : "no one else on this slot"}
                </div>
                <button
                  type="button"
                  className="flex h-7 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-lg border border-dashed border-border px-2.5 text-[11.5px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setAddAgentsOpen(true)}
                >
                  <Plus size={12} /> Add agents
                </button>
              </div>
              <div className="flex flex-col gap-2.5 px-3 py-[11px]">
                <div className="flex flex-wrap gap-1.5">
                  {group.map((member) => {
                    const isThis = member.span.shift._id === shift._id;
                    const isRemoved = removedIds.includes(member.span.shift._id);
                    return (
                      <span
                        key={member.span.shift._id}
                        className={cn(
                          "flex h-[30px] items-center gap-[7px] rounded-lg border pl-[3px] pr-2.5 text-[12px] font-semibold",
                          isThis
                            ? "border-primary bg-primary/[0.06] dark:bg-primary/[0.16]"
                            : "border-border bg-card",
                          isRemoved &&
                            "opacity-50 line-through decoration-1"
                        )}
                      >
                        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-muted text-[9.5px] font-bold text-muted-foreground">
                          {member.initials}
                        </span>
                        <span className="whitespace-nowrap">{member.agentName}</span>
                        <span className="whitespace-nowrap text-[10.5px] tabular-nums text-muted-foreground">
                          {isThis
                            ? formatRange(range)
                            : `${formatHour(member.span.start)}–${formatHour(
                                member.span.end
                              )}`}
                        </span>
                        {isThis ? (
                          <span className="whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.04em] text-primary">
                            editing
                          </span>
                        ) : (
                          <button
                            type="button"
                            title={
                              isRemoved
                                ? "Keep on this slot"
                                : "Remove from this slot"
                            }
                            aria-label={`Remove ${member.agentName} from this slot`}
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setRemovedIds((current) =>
                                current.includes(member.span.shift._id)
                                  ? current.filter(
                                      (id) => id !== member.span.shift._id
                                    )
                                  : [...current, member.span.shift._id]
                              )
                            }
                          >
                            ×
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>

                <label className="flex w-fit cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={applyAll}
                    onChange={(event) => setApplyAll(event.target.checked)}
                  />
                  <span
                    className={cn(
                      "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border text-[10.5px] font-bold",
                      applyAll
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    )}
                  >
                    {applyAll ? "✓" : ""}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {others.length > 0
                      ? `Apply these changes to all ${group.length} agents on this slot`
                      : "Apply changes to everyone on this slot"}
                  </span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-[26px] gap-y-[3px] sm:grid-cols-2">
              {details.map((detail) => (
                <div
                  key={detail.label}
                  className="flex h-6 items-center gap-2"
                >
                  <div className="w-[104px] shrink-0 text-[11.5px] text-muted-foreground">
                    {detail.label}
                  </div>
                  <div
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12px] font-medium",
                      detail.tone === "ok" && "text-ok",
                      detail.tone === "warn" && "text-warn"
                    )}
                    title={detail.value}
                  >
                    {detail.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-t border-border bg-band px-[18px] py-3">
            <Button
              variant="outline"
              className="h-[34px] rounded-lg border-destructive/40 px-3 text-[13px] font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={saving}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
            <div className="min-w-0 flex-1 truncate pr-1 text-right text-[11.5px] text-muted-foreground">
              {removedIds.length
                ? `${removedIds.length} removed from this slot`
                : dirty
                  ? "Unsaved changes"
                  : ""}
            </div>
            <Button
              variant="outline"
              className="h-[34px] rounded-lg px-3 text-[13px] font-medium"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-[34px] rounded-lg px-3.5 text-[13px] font-semibold"
              disabled={saving || (!dirty && removedIds.length === 0)}
              onClick={handleSave}
            >
              {saving
                ? "Saving…"
                : applyAll && others.length > 0
                  ? `Save ${group.length} shifts`
                  : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
            <AlertDialogDescription>
              {agent?.name}&apos;s {position.name} shift, {formatRange(range)}.
              {shift.isSynced
                ? " It will also be removed from their Google Calendar."
                : ""}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* "Add agents" is the create dialog seeded with this slot — the same slot, the
          same position, nobody selected yet. Reusing it keeps the conflict handling and
          the coverage preview instead of growing a second, weaker agent picker here. */}
      {addAgentsOpen && (
        <CreateShiftDialog
          open
          onOpenChange={setAddAgentsOpen}
          selectedDate={selectedDate}
          initialRange={range}
          initialPositionId={positionId}
        />
      )}
    </>
  );
};

export default EditShiftDialog;
