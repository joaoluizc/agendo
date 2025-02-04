import { cn } from "@/lib/utils";
import CreateShiftDialog from "./CreateShiftDialog";
import { useUserSettings } from "@/providers/useUserSettings";

type EmptySlotProps = {
  userId: string;
  visitorId: string;
  currentHour: number;
  selectedDate: Date;
};

function EmptySlot(props: EmptySlotProps) {
  const { userId, visitorId, currentHour, selectedDate } = props;
  const { type: userType } = useUserSettings();
  const date = new Date(selectedDate);
  date.setHours(currentHour);
  date.setMinutes(0);

  return userType === "admin" ? (
    <CreateShiftDialog selectedDate={date} selectedUserId={userId}>
      <div
        key={`key-${currentHour}`}
        className={cn(
          "border-r",
          String(userId) === String(visitorId)
            ? "border-primary/20"
            : "border-secondary",
          new Date().getHours() === currentHour
            ? "bg-secondary/80"
            : "background"
        )}
      >
        <div
          className={
            "m-1 h-10 hover:border-2 justify-center items-center cursor-pointer flex group"
          }
        >
          <span className="group-hover:block hidden">+</span>
        </div>
      </div>
    </CreateShiftDialog>
  ) : (
    <div
      key={`key-${currentHour}`}
      className={cn(
        "border-r",
        String(userId) === String(visitorId)
          ? "border-primary/20"
          : "border-secondary",
        new Date().getHours() === currentHour ? "bg-secondary/80" : "background"
      )}
    ></div>
  );
}

export default EmptySlot;
