import { useCallback, useEffect, useRef } from "react";
import * as chrono from "chrono-node";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import AirDatepicker from "air-datepicker";
import localeEn from "air-datepicker/locale/en";

const localeStringOptions: { dateStyle: "short"; timeStyle: "short" } = {
  dateStyle: "short",
  timeStyle: "short",
};

const StartTimeInput = ({
  startTime,
  setStartTime,
}: {
  startTime: string;
  setStartTime: (value: string) => void;
}) => {
  const startTimeRefNew = useRef<HTMLInputElement | null>(null);
  const startDatepickerRefNew = useRef<AirDatepicker | null>(null);

  const initializeDatepicker = useCallback(() => {
    if (startDatepickerRefNew.current) startDatepickerRefNew.current.destroy();

    startDatepickerRefNew.current = new AirDatepicker(
      document.querySelector("#startTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setStartTime(
            (date as Date).toLocaleString(undefined, localeStringOptions)
          );
        },
        selectedDates: [new Date(startTime)],
        locale: localeEn,
        dateFormat: "M/d/yy,",
        timeFormat: "h:mm AA",
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: ["today", "clear"],
        toggleSelected: false,
        keyboardNav: false,
      }
    );
  }, []);

  useEffect(() => {
    initializeDatepicker();
    return () => {
      if (startDatepickerRefNew.current)
        startDatepickerRefNew.current.destroy();
    };
  }, []);

  const handleStartTimeChange = useCallback(() => {
    const parsedDate = chrono.parseDate(startTime);
    if (parsedDate) {
      setStartTime(parsedDate.toLocaleString(undefined, localeStringOptions));
    } else {
      setStartTime("Invalid date");
    }
  }, [startTime]);

  return (
    <div className="grid grid-cols-4 items-center gap-4">
      <Label htmlFor="startTime" className="text-right">
        Start Time
      </Label>
      <Input
        id="startTime"
        className="col-span-3 p-2 border rounded cursor-pointer hover:bg-secondary/80"
        ref={startTimeRefNew}
        onChange={(e) => setStartTime(e.target.value)}
        onBlur={handleStartTimeChange}
        value={startTime}
      />
    </div>
  );
};

export default StartTimeInput;
