import { cn } from "@/lib/utils";
import CreateShiftDialog from "./CreateShiftDialog";
import { useUserSettings } from "@/providers/useUserSettings";
import { useSchedule } from "@/providers/useSchedule";
import { NewShift, Shift } from "@/types/shiftTypes";
import { toast } from "sonner";

type EmptySlotProps = {
  userId: string;
  visitorId: string;
  currentHour: number;
  selectedDate: Date;
};

function EmptySlot(props: EmptySlotProps) {
  const { userId, visitorId, currentHour, selectedDate } = props;
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

    if (!shifts[createdShift.userId]) {
      shifts[createdShift.userId] = [];
    }

    const prevUserShifts = shifts[prevUserId].filter(
      (shift) => shift._id !== createdShift._id
    );
    console.log("createdShift", createdShift);
    console.log("prevUserShifts", prevUserShifts);
    shifts[prevUserId] = prevUserShifts;

    shifts[createdShift.userId].push(createdShift);

    shifts[createdShift.userId].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    setShifts({ ...shifts });

    if (createdShift.isSynced) {
      events
        .find((event) => event.userId === createdShift.userId)
        ?.events.push(createdShift.syncedEvent);
      events
        .find((event) => event.userId === createdShift.userId)
        ?.events.sort((a, b) => {
          return (
            new Date(a.start.dateTime).getTime() -
            new Date(b.start.dateTime).getTime()
          );
        });
      setEvents([...events]);
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

  return userType === "admin" ? (
    <CreateShiftDialog selectedDate={date} selectedUserId={userId}>
      <div
        key={`key-${currentHour}`}
        className={cn(
          "border-r",
          String(userId) === String(visitorId)
            ? "border-primary/20"
            : "border-secondary",
          new Date().getHours() === currentHour
            ? "bg-secondary/80"
            : "background"
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          className={
            "m-1 h-10 hover:border-2 justify-center items-center cursor-pointer flex group"
          }
        >
          <span className="group-hover:block hidden">+</span>
        </div>
      </div>
    </CreateShiftDialog>
  ) : (
    <div
      key={`key-${currentHour}`}
      className={cn(
        "border-r",
        String(userId) === String(visitorId)
          ? "border-primary/20"
          : "border-secondary",
        new Date().getHours() === currentHour ? "bg-secondary/80" : "background"
      )}
    ></div>
  );
}

export default EmptySlot;
