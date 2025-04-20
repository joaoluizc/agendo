import { useSchedule } from "@/providers/useSchedule";
import { Shift } from "@/types/shiftTypes";
import removeShiftFromSchedule from "@/utils/removeShiftFromSchedule";
import removeShiftsFromSchedule from "@/utils/removeShiftsFromSchedule";

function useRemoveShiftFromSchedule(type: "single" | "bulk") {
  const { shifts, events, setShifts, setEvents } = useSchedule();

  if (type === "bulk") {
    return (shiftsToRemove: Shift[]) => {
      removeShiftsFromSchedule(
        shiftsToRemove,
        shifts,
        events,
        setShifts,
        setEvents
      );
    };
  } else if (type === "single") {
    return (shift: Shift) => {
      removeShiftFromSchedule(shift, shifts, events, setShifts, setEvents);
    };
  } else {
    throw new Error(
      "Invalid type sent for useRemoveShiftFromSchedule hook. Use 'single' or 'bulk'."
    );
  }
}

export default useRemoveShiftFromSchedule;
