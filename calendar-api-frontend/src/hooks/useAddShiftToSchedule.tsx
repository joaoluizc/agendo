import { useSchedule } from "@/providers/useSchedule";
import { Shift } from "@/types/shiftTypes";
import { addShiftToSchedule } from "@/utils/addShiftToSchedule";

function useAddShiftToSchedule() {
  const { events, shifts, setEvents, setShifts } = useSchedule();

  return (newShift: Shift) => {
    addShiftToSchedule(newShift, shifts, events, setShifts, setEvents);
  };
}

export default useAddShiftToSchedule;
