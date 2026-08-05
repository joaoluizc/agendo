import { useState } from "react";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { NewShift, Shift } from "@/types/shiftTypes";
import { toast } from "sonner";
import CreateShiftDialog from "../shift-dialogs/CreateShiftDialog";

type EmptySlotProps = {
  userId: string;
  currentHour: number;
  selectedDate: Date;
};

function EmptySlot(props: EmptySlotProps) {
  const { userId, currentHour, selectedDate } = props;
  const { type: userType } = useUserSettings();
  const { shiftInDrag, setShiftInDrag, shifts, setShifts, events, setEvents } =
    useSchedule();
  const [createOpen, setCreateOpen] = useState(false);
  const date = new Date(selectedDate);
  date.setHours(currentHour);
  date.setMinutes(0);

  const submitShiftUpdate = async (newShift: NewShift, prevUserId: string) => {
    let responseData: { message: string; data: Shift } = {
      message: "",
      data: {} as Shift,
    };

    try {
      const response = await fetch(`/api/shift?shiftId=${newShift._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newShift),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to edit shift");

      responseData = await response.json();

      toast.success("Shift updated successfully");
    } catch (error) {
      console.error("Error updating shift:", error);
      toast.error("Failed to update shift");
    }

    const shiftDate = new Date(newShift.startTime);
    const scheduleDate = new Date(selectedDate);

    if (
      shiftDate.getDate() !== scheduleDate.getDate() ||
      shiftDate.getMonth() !== scheduleDate.getMonth() ||
      shiftDate.getFullYear() !== scheduleDate.getFullYear()
    ) {
      return;
    }

    const createdShift = responseData.data;
    const targetUserId = createdShift.userId;

    // Replace every level rather than mutating in place: the grid memoises each
    // agent's lane packing on their own shift array, so an array that keeps its
    // identity leaves the moved shift invisible until a reload. Filtering the
    // target as well as the source keeps a same-agent drop from duplicating it.
    const withoutMoved = (userShifts: Shift[] | undefined) =>
      (userShifts ?? []).filter((shift) => shift._id !== createdShift._id);

    const updated = { ...shifts };
    updated[prevUserId] = withoutMoved(updated[prevUserId]);
    updated[targetUserId] = [
      ...withoutMoved(updated[targetUserId]),
      createdShift,
    ].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    setShifts(updated);

    if (createdShift.isSynced) {
      setEvents(
        events.map((calendarUser) =>
          calendarUser.userId === targetUserId
            ? {
                ...calendarUser,
                events: [...calendarUser.events, createdShift.syncedEvent].sort(
                  (a, b) =>
                    new Date(a.start.dateTime).getTime() -
                    new Date(b.start.dateTime).getTime()
                ),
              }
            : calendarUser
        )
      );
    }
  };

  const handleDrop = () => {
    const prevUserId = shiftInDrag.data?.userId || "";

    if (shiftInDrag && shiftInDrag.data) {
      const shiftDuration =
        new Date(shiftInDrag.data.endTime).getTime() -
        new Date(shiftInDrag.data.startTime).getTime();

      const newShift = {
        ...shiftInDrag.data,
        userId: userId,
        startTime: new Date(date).toISOString(),
        endTime: new Date(date.getTime() + shiftDuration).toISOString(),
      };

      submitShiftUpdate(newShift, prevUserId);
      setShiftInDrag({ isBeingDragged: false, data: null });
    }
  };

  // One cell per hour, sitting underneath the shift lanes as a full-height click and
  // drop target. The row's hour lines and tint are drawn by AgentRow, so these cells
  // stay transparent — they exist for the interaction, not the paint.
  if (userType !== "admin") return <div key={`key-${currentHour}`} />;

  return (
    <>
      <div
        key={`key-${currentHour}`}
        role="button"
        tabIndex={-1}
        aria-label={`Create a shift at ${currentHour}:00`}
        className={cn(
          "group flex h-full cursor-pointer items-center justify-center",
          "hover:bg-foreground/[0.04]"
        )}
        onClick={() => setCreateOpen(true)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="hidden text-[11px] leading-none text-muted-foreground group-hover:block">
          +
        </span>
      </div>

      {/* Mounted only once opened. There is one of these per hour per agent — 384 on a
          full roster — and the dialog derives the whole roster's conflicts and coverage
          on render, so keeping them all mounted would do that work 384 times over. */}
      {createOpen && (
        <CreateShiftDialog
          open
          onOpenChange={setCreateOpen}
          selectedDate={selectedDate}
          initialUserId={userId}
          initialRange={{ start: currentHour, end: currentHour + 1 }}
        />
      )}
    </>
  );
}

export default EmptySlot;
