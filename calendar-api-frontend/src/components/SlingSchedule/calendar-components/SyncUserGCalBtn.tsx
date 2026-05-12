import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useUserSettings } from "@/providers/useUserSettings.tsx";

type SyncUserGCalBtnProps = {
  selectedDate: Date;
  userEmail: string;
  userName: string;
};

const SyncUserGCalBtn = ({
  selectedDate,
  userEmail,
  userName,
}: SyncUserGCalBtnProps) => {
  const { type: userType } = useUserSettings();
  const [isLoading, setIsLoading] = useState(false);

  if (userType !== "admin") return null;

  const syncUserShifts = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      const response = await fetch(
        "/api/gcalendar/admin-sync-user-day-shifts",
        {
          method: "POST",
          mode: "cors",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: selectedDate, userEmail }),
        },
      );
      const data = await response.json();
      if (response.status !== 200) {
        toast.error("Error syncing shifts to calendar");
        return;
      }
      toast.success(data);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={syncUserShifts}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed"
        disabled={isLoading}
      >
        {isLoading ? (
          <LoaderCircle className="h-3 w-3 animate-spin shrink-0" />
        ) : (
          <RefreshCw className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">Sync {userName}&apos;s shifts</span>
      </button>
    </div>
  );
};

export default SyncUserGCalBtn;
