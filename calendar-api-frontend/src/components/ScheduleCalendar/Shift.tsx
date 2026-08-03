import { useUserSettings } from "@/providers/useUserSettings";
import {
  columnSpan,
  columnStart,
  dayBounds,
  positionDisplay,
  prettyTimeRange,
} from "./scheduleUtils";
import type { Shift } from "@/types/shiftTypes";
import { Dialog, DialogTrigger } from "../ui/dialog";
import { useState, useMemo, useEffect } from "react";
import { EditShiftDialog } from "./EditShiftDIalog";
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
    bulkSelectedShifts,
    setBulkSelectedShifts,
  } = useSchedule();
  const { allPositions, type: userType } = useUserSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [isSelected, setIsSelected] = useState(false);

  const span = useMemo(
    () => dayBounds(shift.startTime, shift.endTime, selectedDate),
    [shift.startTime, shift.endTime, selectedDate]
  );
  const start = columnStart(span.start);
  const cols = columnSpan(span);

  useEffect(() => {
    if (bulkSelectedShifts) {
      const isAlreadySelected = bulkSelectedShifts.some(
        (selectedShift) => selectedShift._id === shift._id
      );
      setIsSelected(isAlreadySelected);
    } else {
      setIsSelected(false);
    }
  }, [bulkSelectedShifts]);

  const position = useMemo(
    () =>
      positionDisplay(
        allPositions.find((pos) => String(shift.positionId) === String(pos._id))
      ),
    [allPositions, shift.positionId]
  );

  const handleDragStart = () => {
    if (userType === "admin") {
      setShiftInDrag({
        isBeingDragged: true,
        data: shift,
      });
    }
  };

  const toggleSelected = () => {
    if (userType !== "admin") return;

    setIsSelected((prev) => !prev);

    if (!bulkSelectedShifts) return;

    const isAlreadySelected = bulkSelectedShifts.some(
      (selectedShift) => selectedShift._id === shift._id
    );

    const updatedShifts = isAlreadySelected
      ? bulkSelectedShifts.filter(
          (selectedShift) => selectedShift._id !== shift._id
        )
      : [...(bulkSelectedShifts || []), shift];
    setBulkSelectedShifts(updatedShifts);
  };

  /**
   * Content degrades with width instead of truncating into nothing: the time goes
   * first (the hour ruler already says when), then the label falls back to a
   * two-letter code. The full name and time are always on the hover title.
   */
  const mode =
    cols >= 6 ? "full" : cols >= 3 ? "label" : cols === 2 ? "tight" : "code";

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
    gridColumnStart: start,
    gridColumnEnd: `span ${cols}`,
    gridRowStart: lane,
    marginLeft: span.clippedStart ? 0 : 2,
    marginRight: span.clippedEnd ? 0 : 2,
    borderRadius: radius,
    cursor: userType === "admin" ? "pointer" : "default",
    ...toneStyle,
    ...(isBulkSelectorActive && isSelected
      ? { outline: "2px solid hsl(var(--foreground))", outlineOffset: "-2px" }
      : {}),
  };

  const title = `${position.name} · ${prettyTimeRange(
    shift.startTime,
    shift.endTime
  )}`;

  const body =
    mode === "full" ? (
      <div className="flex flex-col justify-center h-full px-2 overflow-hidden pointer-events-none">
        <div className="text-[11px] font-bold tabular-nums leading-tight truncate">
          {prettyTimeRange(shift.startTime, shift.endTime)}
        </div>
        <div className="text-[10.5px] font-medium leading-tight truncate opacity-90">
          {position.label}
        </div>
      </div>
    ) : mode === "label" ? (
      <div className="flex items-center h-full px-1.5 overflow-hidden pointer-events-none">
        <span className="text-[11px] font-semibold truncate">
          {position.label}
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
    "pointer-events-auto overflow-hidden select-none",
    userType === "admin" && !isBulkSelectorActive && "hover:brightness-110"
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div
          draggable={userType === "admin"}
          onDragStart={handleDragStart}
          title={title}
          className={blockClass}
          style={blockStyle}
        >
          {body}
        </div>
      </DialogTrigger>
      {userType === "admin" && (
        <EditShiftDialog
          shift={shift}
          setIsOpen={setIsOpen}
          reloadScheduleCalendar={reloadScheduleCalendar}
        />
      )}
    </Dialog>
  );
}
