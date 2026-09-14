import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { prettyTimeRange, startOfLocalDay } from "../scheduleUtils";
import {
  DAY_HOURS,
  HOUR_STEP,
  HourRange,
  hourToDate,
} from "../shift-dialogs/shiftPlanning";

type EmptySlotProps = {
  userId: string;
  currentHour: number;
  selectedDate: Date;
  /**
   * Open the create dialog on this range.
   *
   * The dialog is mounted by the row rather than here: a drag across empty space spans
   * several cells, so the row owns that gesture — and a click and a drag then reach the
   * dialog by the same path and cannot disagree about the range it opens on.
   */
  onRequestCreate: (range: HourRange) => void;
};

function EmptySlot(props: EmptySlotProps) {
  const { userId, currentHour, selectedDate, onRequestCreate } = props;
  const { type: userType, allUsers, allPositions } = useUserSettings();
  const {
    shiftInDrag,
    setShiftInDrag,
    setPendingChange,
    dropTarget,
    setDropTarget,
  } = useSchedule();

  /**
   * The quarter-hour the pointer is actually over, as a fractional hour.
   *
   * The cells are one per hour, but a drop lands on a 15-minute boundary like a resize
   * does, so the landing time comes from where inside the cell the pointer sits rather
   * than from the cell alone. Rounding is done on the absolute hour, not on the fraction,
   * so the far right of the 09:00 cell resolves to 10:00 instead of being pinned to 09:45.
   *
   * Both the preview and the drop call this, which is what stops them disagreeing.
   */
  const pointerHour = (event: React.DragEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const withinCell = rect.width
      ? (event.clientX - rect.left) / rect.width
      : 0;
    const snapped =
      Math.round((currentHour + withinCell) / HOUR_STEP) * HOUR_STEP;
    return Math.min(DAY_HOURS - HOUR_STEP, Math.max(0, snapped));
  };

  /**
   * Names for the prompt. Looked up on demand inside the drop handler rather than memoised
   * per cell: there are 384 of these on a full roster and only the one being dropped on
   * ever needs a name.
   */
  const agentName = (id: string) => {
    const agent = allUsers.find((entry) => String(entry.id) === String(id));
    return agent
      ? `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim() || "that agent"
      : "that agent";
  };

  const positionName = (id: string) =>
    allPositions.find((entry) => String(entry._id) === String(id))?.name ??
    "Shift";

  /** The dragged shift's duration in ms — a move keeps its length. */
  const draggedDuration = () => {
    const dragged = shiftInDrag?.data;
    if (!dragged) return 0;
    return (
      new Date(dragged.endTime).getTime() -
      new Date(dragged.startTime).getTime()
    );
  };

  /** Do these instants fall on different local days? */
  const crossesMidnight = (startTime: string, endTime: string) => {
    const startDay = startOfLocalDay(new Date(startTime)).getTime();
    const endDay = startOfLocalDay(new Date(endTime)).getTime();
    // An end at exactly midnight closes the day rather than spilling into the next one,
    // which is how the grid draws it too.
    return endDay > startDay && new Date(endTime).getTime() > endDay;
  };

  /** Absolute instants for a landing at `hour` on the selected day. */
  const landing = (hour: number) => {
    const start = hourToDate(selectedDate, hour);
    return {
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + draggedDuration()).toISOString(),
    };
  };

  /**
   * Land a dragged shift on this hour, for this agent.
   *
   * The move is not written here. It asks the same question a resize does — commit this, or
   * keep it a plan? — so it is parked on `pendingChange` and one shared prompt asks, then
   * saves. The first version of this posted the update itself and forced the result to
   * draft silently, which was safe and completely unexplained.
   */
  const handleDrop = (event: React.DragEvent) => {
    const dragged = shiftInDrag?.data;
    const clear = () => {
      setShiftInDrag({ isBeingDragged: false, data: null });
      setDropTarget(null);
    };
    if (!dragged) return clear();

    const { startTime, endTime } = landing(pointerHour(event));

    // Dropping a shift back where it already is is not a change, so it does not get a
    // prompt or a write. Without this, picking a shift up and putting it down asked whether
    // to publish a change that did not exist — and answering would have re-timed it to
    // identical values and, if published, deleted and recreated its calendar event.
    const sameSlot =
      String(dragged.userId) === userId &&
      new Date(dragged.startTime).getTime() === new Date(startTime).getTime();
    if (sameSlot) return clear();

    const movedAgent = String(dragged.userId) !== userId;
    setPendingChange({
      intent: "retime",
      shift: dragged,
      startTime,
      endTime,
      userId,
      summary: `${positionName(dragged.positionId)} · ${prettyTimeRange(
        dragged.startTime,
        dragged.endTime
      )} → ${prettyTimeRange(startTime, endTime)}`,
      // Naming both people matters more here than anywhere else: a drop can land on a row
      // you did not mean, and "moved to another agent" would not have told you which.
      // A drop late in the day can push the end past midnight, which is legitimate but
      // easy to do without noticing — the shift then appears on two days and its times
      // can only be edited from the dialog, so it is worth saying before you commit.
      detail: [
        movedAgent
          ? `${agentName(dragged.userId)} → ${agentName(userId)}`
          : null,
        crossesMidnight(startTime, endTime)
          ? `Crosses midnight — ends ${new Date(endTime).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    });
    clear();
  };

  /**
   * Report this cell as the landing spot, for the row to draw a preview from.
   *
   * `dragover` fires continuously while the pointer moves, so the write is guarded on the
   * target actually changing — otherwise every mouse move would re-render the whole
   * schedule. With the guard it fires at most once per cell entered.
   */
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (!shiftInDrag?.data) return;
    const hour = pointerHour(event);
    if (dropTarget?.userId === userId && dropTarget?.hour === hour) return;
    setDropTarget({ userId, hour });
  };

  // One cell per hour, sitting underneath the shift lanes as a full-height click and
  // drop target. The row's hour lines and tint are drawn by AgentRow, so these cells
  // stay transparent — they exist for the interaction, not the paint.
  if (userType !== "admin") return <div key={`key-${currentHour}`} />;

  return (
    <div
      key={`key-${currentHour}`}
      role="button"
      tabIndex={-1}
      aria-label={`Create a shift at ${currentHour}:00`}
      className={cn(
        "group flex h-full cursor-pointer items-center justify-center",
        "hover:bg-foreground/[0.04]"
      )}
      // The touch path. A mouse press — drag or not — is resolved by the row, which
      // swallows the click that follows it: the row's pointer capture retargets that click
      // away from this cell anyway, so handling it here would never have run for a mouse.
      onClick={() =>
        onRequestCreate({ start: currentHour, end: currentHour + 1 })
      }
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <span className="hidden text-[11px] leading-none text-muted-foreground group-hover:block">
        +
      </span>
    </div>
  );
}

export default EmptySlot;
