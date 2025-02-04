import { useContext } from "react";
import { ScheduleContext } from "./schedule-provider";

export const useSchedule = () => {
  const context = useContext(ScheduleContext);
  if (context === undefined) {
    throw new Error("useSchedule must be used within an ScheduleProvider");
  }
  return context;
};
