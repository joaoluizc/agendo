import { useUserSettings } from "@/providers/useUserSettings";
import {
  dayBounds,
  isDraft,
  positionDisplay,
  prettyTimeRange,
  spanPlacement,
} from "./scheduleUtils";
import type { Shift } from "@/types/shiftTypes";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  DAY_HOURS,
  HOUR_STEP,
  formatRange,
  rangeToIso,
} from "./shift-dialogs/shiftPlanning";
import EditShiftDialog from "./shift-dialogs/EditShiftDialog";
import { useSchedule } from "@/providers/useSchedule";
import { cn } from "@/lib/utils";

type ShiftProps = {
  shift: Shift;
  selectedDate: Date;
  /** 1-based lane from packLanes, so overlapping shifts stack instead of collide. */
  lane: number;
  reloadScheduleCalendar: () => void;
};

/**
 * Perceived lightness of a hex color, used to decide whether a saturated fill needs
 * white or dark text. Positions are admin-picked, so we can't assume the palette.
 */
const isLightColor = (hex: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return false;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.68;
};

export function Shift(props: ShiftProps) {
  const { shift, selectedDate, lane, reloadScheduleCalendar } = props;
  const {
    setShiftInDrag,
    isBulkSelectorActive,
    setIsBulkSelectorActive,
    bulkSelectedShifts,
    setBulkSelectedShifts,
    selectedShiftIds,
    focusedPositionIds,
    pendingChange,
    setPendingChange,
    setDropTarget,
  } = useSchedule();
  const { allPositions, type: userType } = useUserSettings();
  const [isOpen, setIsOpen] = useState(false);
  // Read straight off the provider's id set. This used to be local state synced by an
  // effect that scanned the whole selection, which made select-all quadratic and painted
  // every block a frame late.
  const isSelected = selectedShiftIds.has(shift._id);
  const outOfFocus =
    focusedPositionIds !== null && !focusedPositionIds.has(String(shift.positionId));
  const blockRef = useRef<HTMLDivElement>(null);

  /**
   * Live edge-drag state: non-null while a resize is in progress, and held past release
   * until the prompt it raised is answered.
   */
  const [resizing, setResizing] = useState<{
    start: number;
    end: number;
    /** The drag has crossed the opposite edge, so releasing means delete. */
    deleteIntent: boolean;
  } | null>(null);
  /** True between raising a pending change and it being resolved. */
  const awaitingPrompt = useRef(false);

  // Drop the held preview once the prompt closes. A saved change arrives as new stored
  // times, so the block lands on them; a cancelled delete snaps back to where it was.
  useEffect(() => {
    if (pendingChange || !awaitingPrompt.current) return;
    awaitingPrompt.current = false;
    setResizing(null);
  }, [pendingChange]);

  const storedSpan = useMemo(
    () => dayBounds(shift.startTime, shift.endTime, selectedDate),
    [shift.startTime, shift.endTime, selectedDate]
  );
  // While dragging an edge, the block follows the pointer rather than the saved times —
  // resizing something you cannot see the size of is guesswork.
  const span = resizing
    ? { ...storedSpan, start: resizing.start, end: resizing.end }
    : storedSpan;
  // Placed with sub-cell precision rather than snapped to the half-hour track, so a
  // 15-minute break is drawn as 15 minutes. See spanPlacement.
  const place = useMemo(() => spanPlacement(span), [span]);

  /**
   * The shift runs across a day boundary, so what this row shows is only part of it.
   *
   * Read from the stored span rather than the live one: a resize in progress must not
   * change the answer mid-drag. Drives both the missing resize handles and the hover text.
   */
  const spansTwoDays = storedSpan.clippedStart || storedSpan.clippedEnd;

  const position = useMemo(
    () =>
      positionDisplay(
        allPositions.find((pos) => String(shift.positionId) === String(pos._id))
      ),
    [allPositions, shift.positionId]
  );

  /**
   * Drag one edge to retime that end of the shift.
   *
   * Right edge moves the end, left edge moves the start; nothing else moves. Steps in
   * `HOUR_STEP` (15 minutes), the same increment the dialog's steppers use, so the two
   * cannot disagree about what a legal time is.
   *
   * Pointer events rather than HTML5 drag-and-drop: DnD is already used on the block for
   * moving it between agents, gives no continuous position to preview from, and cannot be
   * constrained to one axis. `setPointerCapture` keeps the drag alive when the pointer
   * leaves the narrow handle, which it immediately does.
   *
   * Scale comes from the track, not the block: the row's 48 columns fill their container,
   * so container width / 24 is exactly one hour. Measuring the block instead would make a
   * 15-minute shift — a few pixels wide — the least precise thing to calibrate against.
   */
  const beginResize =
    (edge: "start" | "end") => (event: React.PointerEvent<HTMLDivElement>) => {
      if (userType !== "admin" || isBulkSelectorActive) return;
      event.preventDefault();
      event.stopPropagation();

      const track = blockRef.current?.parentElement;
      if (!track) return;
      const pxPerHour = track.getBoundingClientRect().width / DAY_HOURS;
      if (!pxPerHour) return;

      const originX = event.clientX;
      const base = { start: storedSpan.start, end: storedSpan.end };
      // The listeners close over this rather than over state: a pointerup handler reading
      // `resizing` would see whatever value it captured on the render that installed it.
      let latest = { ...base, deleteIntent: false };

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const delta =
          Math.round((moveEvent.clientX - originX) / pxPerHour / HOUR_STEP) *
          HOUR_STEP;

        let start = base.start;
        let end = base.end;
        if (edge === "end") end = base.end + delta;
        else start = base.start + delta;

        // Measured before clamping: once the dragged edge has crossed the other one, the
        // gesture stops being a resize and becomes "get rid of this".
        const deleteIntent = end - start <= 0;

        if (edge === "end") {
          end = Math.min(DAY_HOURS, Math.max(base.start + HOUR_STEP, end));
        } else {
          start = Math.max(0, Math.min(base.end - HOUR_STEP, start));
        }

        latest = { start, end, deleteIntent };
        setResizing(latest);
      };

      const onUp = () => {
        handle.releasePointerCapture(event.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);

        const unchanged =
          latest.start === base.start && latest.end === base.end;
        if (!latest.deleteIntent && unchanged) {
          setResizing(null);
          return;
        }

        // Hold the preview until the prompt is answered. Snapping back on release would
        // have the dialog describing a change the grid no longer shows.
        awaitingPrompt.current = true;

        const next = rangeToIso(selectedDate, {
          start: latest.start,
          end: latest.end,
        });
        setPendingChange({
          intent: latest.deleteIntent ? "delete" : "retime",
          shift,
          startTime: next.startTime,
          endTime: next.endTime,
          userId: String(shift.userId),
          summary: latest.deleteIntent
            ? `${position.name} · ${formatRange(base)}`
            : `${position.name} · ${formatRange(base)} → ${formatRange(latest)}`,
        });
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (userType !== "admin") return;

    /**
     * Anchor the floating block at its own start, not at the point you grabbed.
     *
     * The drop lands the shift's *start* under the cursor, so a block grabbed by its
     * middle floated half an hour to the right of where it was going to land — the ghost
     * and the preview disagreed, and the ghost is the one your eye follows. Re-anchoring
     * the drag image to x=0 makes the two agree.
     *
     * The alternative was to make the drop respect the grab offset, which is arguably
     * nicer and considerably more to go wrong: the offset has to survive the whole drag,
     * be converted back to time, and stay correct for a block clipped at either end of the
     * day. This is one line and cannot drift.
     */
    if (blockRef.current) {
      const rect = blockRef.current.getBoundingClientRect();
      event.dataTransfer.setDragImage(blockRef.current, 0, rect.height / 2);
    }

    setShiftInDrag({
      isBeingDragged: true,
      data: shift,
    });
  };

  /**
   * Clear the drag state however the drag ends, including a cancelled one.
   *
   * `dragend` fires on the source element even when the user presses Escape or drops on
   * nothing — which `drop` does not. Without this, an abandoned drag left `shiftInDrag`
   * pointing at a shift indefinitely and the drop preview stranded on the last cell the
   * pointer crossed.
   */
  const handleDragEnd = () => {
    setShiftInDrag({ isBeingDragged: false, data: null });
    setDropTarget(null);
  };

  /**
   * Click a shift: open it, or start a selection if a modifier is held.
   *
   * Ctrl (or Cmd on a Mac) enters select-shifts mode and takes this shift as the first
   * pick, instead of opening the edit dialog — so selecting a few shifts no longer means
   * finding the toolbar button first. Only the *first* click needs the modifier; once the
   * mode is on, plain clicks toggle selection through the branch below.
   *
   * Both keys are accepted rather than switching on platform: on Windows and Linux Ctrl is
   * the multi-select modifier, on macOS it is Cmd, and Ctrl there also raises the context
   * menu — so honouring whichever arrives does the right thing on each without sniffing.
   */
  const handleClick = (event: React.MouseEvent) => {
    if (userType !== "admin") return;

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setIsBulkSelectorActive(true);
      if (!isSelected) {
        setBulkSelectedShifts([...bulkSelectedShifts, shift]);
      }
      return;
    }

    setIsOpen(true);
  };

  const toggleSelected = () => {
    if (userType !== "admin") return;

    setBulkSelectedShifts(
      isSelected
        ? bulkSelectedShifts.filter(
            (selectedShift) => selectedShift._id !== shift._id
          )
        : [...bulkSelectedShifts, shift]
    );
  };

  /**
   * Content degrades with width instead of truncating into nothing: the time goes
   * first (the hour ruler already says when), then the label falls back to a
   * two-letter code. The full name and time are always on the hover title.
   *
   * The two roomy tiers print `position.name` and let CSS ellipsise it, because CSS is the
   * only thing here that knows the block's real pixel width. `position.label` is a hard
   * 10-character cut computed in JS, so it produced the same "Customer…" on a four-hour
   * block as on a one-hour one — an ellipsis with 200px of empty space after it. It stays
   * for the narrow tiers, where a word-boundary break beats a mid-word CSS clip.
   *
   * Measured from the shift's real duration in half-hour widths, not from the cells it
   * claims. Since a block is inset inside its cells, a 15-minute shift claims one whole
   * cell but only paints half of it — sizing the content off the claim would put a
   * two-line label in a block half its assumed width.
   */
  const widths = (span.end - span.start) * 2;
  const mode =
    widths >= 6 ? "full" : widths >= 3 ? "label" : widths >= 2 ? "tight" : "code";

  // Unpublished shifts are drawn differently everywhere they appear; see blockStyle.
  const draft = isDraft(shift);

  const toneStyle = useMemo(() => {
    if (position.tone === "loud") {
      return {
        backgroundColor: position.color,
        color: isLightColor(position.color)
          ? "hsl(var(--foreground))"
          : "#ffffff",
      };
    }
    if (position.tone === "mid") {
      return {
        backgroundColor: `color-mix(in srgb, ${position.color} 16%, hsl(var(--card)))`,
        border: `1px solid color-mix(in srgb, ${position.color} 42%, transparent)`,
        color: "hsl(var(--foreground))",
      };
    }
    return {
      backgroundColor: "hsl(var(--muted))",
      border: "1px dashed hsl(var(--border))",
      color: "hsl(var(--muted-foreground))",
    };
  }, [position]);

  // Overnight shifts clipped from an adjacent day lose the rounded corner and the
  // margin on the side they continue from, so they read as running off-screen.
  const radius = `${span.clippedStart ? "0" : "6px"} ${
    span.clippedEnd ? "0" : "6px"
  } ${span.clippedEnd ? "0" : "6px"} ${span.clippedStart ? "0" : "6px"}`;

  const blockStyle = {
    gridColumnStart: place.gridColumnStart,
    gridColumnEnd: `span ${place.cells}`,
    gridRowStart: lane,
    // The inset is what makes a quarter-hour edge land on the real minute inside a
    // half-hour cell; the 2px is the gap between adjacent blocks, as before.
    marginLeft: span.clippedStart
      ? `${place.insetLeftPct}%`
      : `calc(${place.insetLeftPct}% + 2px)`,
    marginRight: span.clippedEnd
      ? `${place.insetRightPct}%`
      : `calc(${place.insetRightPct}% + 2px)`,
    borderRadius: radius,
    cursor: userType === "admin" ? "pointer" : "default",
    ...toneStyle,
    // A draft keeps its position colour, so the block still reads as coverage at a
    // glance, but washed out and dashed: an uncommitted shift must never be mistaken for
    // one that is already on the agent's calendar. Applied after `toneStyle` so it wins
    // for every tone.
    ...(draft
      ? {
          backgroundColor: `color-mix(in srgb, ${position.color} 22%, hsl(var(--card)))`,
          border: `1px dashed color-mix(in srgb, ${position.color} 70%, transparent)`,
          color: "hsl(var(--foreground))",
        }
      : {}),
    // Shrinking past the opposite edge means delete. Saying so during the drag — rather
    // than only in the dialog after release — is what makes it correctable before it is
    // asked, since the gesture that triggers it looks exactly like an over-shrink.
    ...(resizing?.deleteIntent
      ? {
          backgroundColor: "hsl(var(--destructive))",
          backgroundImage: "none",
          border: "1.5px solid hsl(var(--destructive))",
          color: "hsl(var(--destructive-foreground))",
        }
      : {}),
    ...(isBulkSelectorActive && isSelected
      ? { outline: "2px solid hsl(var(--foreground))", outlineOffset: "-2px" }
      : {}),
    // A coverage meter is focused and this shift is not on it: step back, but stay
    // visible and clickable — the time is still taken, which is the point of dimming
    // rather than hiding. A selected shift is never dimmed, so a selection stays legible.
    ...(outOfFocus && !(isBulkSelectorActive && isSelected)
      ? { opacity: 0.28, filter: "saturate(0.3)" }
      : {}),
  };

  const title = `${position.name} · ${prettyTimeRange(
    shift.startTime,
    shift.endTime
  )}${draft ? " · draft (unpublished)" : ""}${
    spansTwoDays
      ? ` · spans two days (${new Date(shift.startTime).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })} → ${new Date(shift.endTime).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}) — edit its times in the dialog`
      : ""
  }`;

  const body =
    mode === "full" ? (
      <div className="flex flex-col justify-center h-full px-2 overflow-hidden pointer-events-none">
        {/* 10px, a step below the position name's 10.5px, and it still reads as the
            dominant line because it is bold. Buying that 1.25px back is half of what makes
            two lines fit the lane without touching its edges — see SHIFT_LANE. */}
        <div className="text-[10px] font-bold tabular-nums leading-tight truncate">
          {prettyTimeRange(shift.startTime, shift.endTime)}
        </div>
        <div className="text-[10.5px] font-medium leading-tight truncate opacity-90">
          {position.name}
        </div>
      </div>
    ) : mode === "label" ? (
      <div className="flex items-center h-full px-1.5 overflow-hidden pointer-events-none">
        <span className="text-[11px] font-semibold truncate">
          {position.name}
        </span>
      </div>
    ) : mode === "tight" ? (
      <div className="flex items-center h-full px-1.5 overflow-hidden pointer-events-none">
        <span className="text-[10px] font-semibold tracking-tight truncate">
          {position.label}
        </span>
      </div>
    ) : (
      <div className="flex items-center justify-center h-full px-px overflow-hidden pointer-events-none">
        <span className="text-[9.5px] font-semibold">{position.code}</span>
      </div>
    );

  const blockClass = cn(
    // `relative` anchors the edge handles.
    "pointer-events-auto relative overflow-hidden select-none",
    userType === "admin" && !isBulkSelectorActive && "hover:brightness-110",
    resizing && "brightness-110"
  );

  return isBulkSelectorActive ? (
    <div
      onClick={toggleSelected}
      title={title}
      className={blockClass}
      style={blockStyle}
    >
      {body}
    </div>
  ) : (
    <>
      <div
        ref={blockRef}
        // Dragging the body moves the shift; dragging an edge resizes it. Turning DnD off
        // mid-resize stops the browser starting a move from the same gesture.
        draggable={userType === "admin" && !resizing}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        title={title}
        className={blockClass}
        style={blockStyle}
        onClick={handleClick}
      >
        {body}
        {/* Edge handles, and none at all on a shift that crosses midnight.
            A resize works on this day's clamped span, which cannot express "past
            midnight" — dragging either edge of an overnight shift would write back only
            the visible part and silently drop the rest. The edit dialog handles those,
            anchored on the shift's own start day. */}
        {userType === "admin" && !isBulkSelectorActive && !spansTwoDays && (
          <>
            {!span.clippedStart && (
              <div
                role="presentation"
                draggable={false}
                onPointerDown={beginResize("start")}
                onClick={(event) => event.stopPropagation()}
                className="absolute inset-y-0 left-0 w-[7px] cursor-ew-resize touch-none"
              />
            )}
            {!span.clippedEnd && (
              <div
                role="presentation"
                draggable={false}
                onPointerDown={beginResize("end")}
                onClick={(event) => event.stopPropagation()}
                className="absolute inset-y-0 right-0 w-[7px] cursor-ew-resize touch-none"
              />
            )}
          </>
        )}
      </div>
      {/* Mounted only once opened: the dialog derives the whole roster's day and the
          coverage series on render, and a full day is around a hundred of these blocks. */}
      {isOpen && userType === "admin" && (
        <EditShiftDialog
          shift={shift}
          selectedDate={selectedDate}
          open
          onOpenChange={setIsOpen}
          reloadScheduleCalendar={reloadScheduleCalendar}
        />
      )}
    </>
  );
}
