import { useUserSettings } from "@/providers/useUserSettings.tsx";
import gCalendarLogo from "../../../resources/calendar-icon.svg";
import { LoaderCircle } from "lucide-react";
import { Button } from "../../ui/button.tsx";
import { toast } from "sonner";
import { useState } from "react";

type SyncWithGCalBtnProps = {
  selectedDate: Date;
};

const SyncWithGCalBtn = (props: SyncWithGCalBtnProps) => {
  const { selectedDate } = props;
  const { type: userType } = useUserSettings();
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const syncWithGCal = async () => {
    setIsLoading(true);
    const response = await fetch("/api/gcalendar/days-shifts-to-gcal", {
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
    toast.success(data.message);
    if (data.errors.length > 0) {
      data.errors.forEach((error: string) => {
        console.error(error);
      });
    }
    setIsLoading(false);
  };

  return (
    userType === "admin" &&
    (!isLoading ? (
      <Button variant={"outline"} onClick={syncWithGCal}>
        <img
          src={gCalendarLogo}
          alt="Google Calendar Logo"
          className="mr-2 h-4 w-4"
        />
        Sync to team calendars
      </Button>
    ) : (
      <Button disabled>
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        Sync to team calendars
      </Button>
    ))
  );
};

export default SyncWithGCalBtn;
