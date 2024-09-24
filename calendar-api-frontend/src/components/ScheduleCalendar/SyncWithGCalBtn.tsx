import { useUserSettings } from "@/providers/useUserSettings";
import { Button } from "../ui/button";

type SyncWithGCalBtnProps = {
  selectedDate: Date;
};

const SyncWithGCalBtn = (props: SyncWithGCalBtnProps) => {
  const { selectedDate } = props;
  const { type: userType } = useUserSettings();
  console.log("adding shifts to google calendar for date: ", selectedDate);
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
    console.log(data);
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
