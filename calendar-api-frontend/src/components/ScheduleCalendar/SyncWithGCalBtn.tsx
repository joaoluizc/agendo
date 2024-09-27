import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { Button } from "../ui/button.tsx";
import { toast } from "sonner";

type SyncWithGCalBtnProps = {
  selectedDate: Date;
};

const SyncWithGCalBtn = (props: SyncWithGCalBtnProps) => {
  const { selectedDate } = props;
  const { type: userType } = useUserSettings();

  const syncWithGCal = async () => {
    const response = await fetch("api/gcalendar/all-shifts-to-gcal", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ date: selectedDate }),
    });
    const data = await response.json();
    if (response.status !== 200) {
      console.log("error syncing shifts to calendar: ", data);
      toast.error("Error syncing shifts to calendar");
      return;
    }
    toast.success(data.message);
  };

  return (
    userType === "admin" && (
      <Button variant="outline" onClick={syncWithGCal}>
        Sync with GCal
      </Button>
    )
  );
};

export default SyncWithGCalBtn;
