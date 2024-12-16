import { LoaderCircle } from "lucide-react";
import gCalendarLogo from "../../../resources/calendar-icon.svg";
import { Button } from "../../ui/button.tsx";
import { toast } from "sonner";
import { useState } from "react";

type SyncMyGCalBtnProps = {
  selectedDate: Date;
};

const SyncMyGCalBtn = (props: SyncMyGCalBtnProps) => {
  const { selectedDate } = props;
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const syncWithGCal = async () => {
    setIsLoading(true);
    const response = await fetch("api/gcalendar/user-day-shifts-to-gcal", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ date: selectedDate }),
    });
    const data = await response.json();
    console.log("syncWithGCal response: ", data);
    if (response.status !== 200) {
      console.log("error syncing shifts to calendar: ", data);
      toast.error("Error syncing shifts to calendar");
      setIsLoading(false);
      return;
    }
    toast.success(data);
    setIsLoading(false);
  };

  return !isLoading ? (
    <Button variant={"outline"} onClick={syncWithGCal}>
      <img
        src={gCalendarLogo}
        alt="Google Calendar Logo"
        className="mr-2 h-4 w-4"
      />
      Sync to my calendar
    </Button>
  ) : (
    <Button disabled>
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
      Sync to my calendar
    </Button>
  );
};

export default SyncMyGCalBtn;
