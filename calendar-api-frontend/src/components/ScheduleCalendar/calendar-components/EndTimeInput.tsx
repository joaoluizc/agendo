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

const EndTimeInput = ({
  endTime,
  setEndTime,
}: {
  endTime: string;
  setEndTime: (value: string) => void;
}) => {
  const endTimeRefNew = useRef<HTMLInputElement | null>(null);
  const endDatepickerRefNew = useRef<AirDatepicker | null>(null);

  const initializeDatepicker = useCallback(() => {
    if (endDatepickerRefNew.current) endDatepickerRefNew.current.destroy();

    endDatepickerRefNew.current = new AirDatepicker(
      document.querySelector("#endTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setEndTime(
            (date as Date).toLocaleString(undefined, localeStringOptions)
          );
        },
        selectedDates: [new Date(endTime)],
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
      if (endDatepickerRefNew.current) endDatepickerRefNew.current.destroy();
    };
  }, []);

  const handleEndTimeChange = useCallback(() => {
    const parsedDate = chrono.parseDate(endTime);
    if (parsedDate) {
      setEndTime(parsedDate.toLocaleString(undefined, localeStringOptions));
    } else {
      setEndTime("Invalid date");
    }
  }, [endTime]);

  return (
    <div className="grid grid-cols-4 items-center gap-4">
      <Label htmlFor="startTime" className="text-right">
        End Time
      </Label>
      <Input
        id="endTime"
        className="col-span-3 p-2 border rounded cursor-pointer hover:bg-secondary/80"
        ref={endTimeRefNew}
        onChange={(e) => setEndTime(e.target.value)}
        onBlur={handleEndTimeChange}
        value={endTime}
      />
    </div>
  );
};

export default EndTimeInput;
