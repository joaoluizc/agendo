import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { Users, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button.tsx";
import { toast } from "sonner";
import { useState } from "react";

type SyncWithGCalBtnProps = {
  selectedDate: Date;
};

type SyncWithGCalSuccessResponse = {
  message: string;
  errors: {
    userId: string;
    firstName: string;
    lastName: string;
    error: string;
  }[];
};

type SyncWithGCalErrorResponse = {
  error: string;
};

type SyncWithGCalResponse =
  | SyncWithGCalSuccessResponse
  | SyncWithGCalErrorResponse;

const SyncWithGCalBtn = (props: SyncWithGCalBtnProps) => {
  const { selectedDate } = props;
  const { type: userType } = useUserSettings();
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const syncWithGCal = async () => {
    setIsLoading(true);
    const response = await fetch("api/gcalendar/days-shifts-to-gcal", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ date: selectedDate }),
    });
    const data: SyncWithGCalResponse = await response.json();
    console.log("syncWithGCal response: ", data);
    if (response.status !== 200) {
      console.log("error syncing shifts to calendar: ", data);
      toast.error("Error syncing shifts to calendar");
      setIsLoading(false);
      return;
    }
    if ("message" in data) {
      toast.success(data.message);
      data.errors.forEach((userWithError) => {
        const errorString =
          "Error syncing shifts for " +
          userWithError.firstName +
          ". Reason: " +
          userWithError.error;
        toast.error(errorString);
      });
      setIsLoading(false);
    }
  };

  return (
    userType === "admin" &&
    (!isLoading ? (
      <Button variant={"outline"} onClick={syncWithGCal}>
        <Users className="mr-2 h-4 w-4" />
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
