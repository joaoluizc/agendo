import { cn } from "@/lib/utils";
import CreateShiftDialog from "./CreateShiftDialog";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { NewShift, Shift } from "@/types/shiftTypes";
import { toast } from "sonner";

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
  const date = new Date(selectedDate);
  date.setHours(currentHour);
  date.setMinutes(0);

  const submitShiftUpdate = async (newShift: NewShift, prevUserId: string) => {
    // setLoading(true);
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

      console.log("Shift updated successfully");
      toast.success("Shift updated successfully");
      // setLoading(false);
    } catch (error) {
      // setLoading(false);
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
    console.log("Dropped shift on slot ", date, "at the hour", currentHour);
    console.log("Shift in drag: ", shiftInDrag);

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

      console.log(newShift);
      submitShiftUpdate(newShift, prevUserId);
      setShiftInDrag({ isBeingDragged: false, data: null });
    }
  };

  // One cell per hour, sitting underneath the shift lanes as a full-height click and
  // drop target. The row's hour lines and tint are drawn by AgentRow, so these cells
  // stay transparent — they exist for the interaction, not the paint.
  if (userType !== "admin") return <div key={`key-${currentHour}`} />;

  return (
    <CreateShiftDialog selectedDate={date} selectedUserId={userId}>
      <div
        key={`key-${currentHour}`}
        className={cn(
          "group flex h-full cursor-pointer items-center justify-center",
          "hover:bg-foreground/[0.04]"
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="hidden text-[11px] leading-none text-muted-foreground group-hover:block">
          +
        </span>
      </div>
    </CreateShiftDialog>
  );
}

export default EmptySlot;
