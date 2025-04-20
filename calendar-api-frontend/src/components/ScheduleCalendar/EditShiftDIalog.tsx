import { cn } from "@/lib/utils";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";
import { useState } from "react";
import { NewShift, Shift } from "@/types/shiftTypes";
import { toast } from "sonner";
import { useUserSettings } from "@/providers/useUserSettings";
import { LoaderCircle } from "lucide-react";
import StartTimeInput from "./calendar-components/StartTimeInput";
import EndTimeInput from "./calendar-components/EndTimeInput";

type EditShiftDialogProps = {
  shift: Shift;
  setIsOpen: (isOpen: boolean) => void;
  reloadScheduleCalendar: () => void;
};

const localeStringOptions: { dateStyle: "short"; timeStyle: "short" } = {
  dateStyle: "short",
  timeStyle: "short",
};

export function EditShiftDialog(props: EditShiftDialogProps) {
  const { setIsOpen, shift, reloadScheduleCalendar } = props;
  const [startTime, setStartTime] = useState<string>(
    new Date(shift.startTime).toLocaleString(undefined, localeStringOptions)
  );
  const [endTime, setEndTime] = useState<string>(
    new Date(shift.endTime).toLocaleString(undefined, localeStringOptions)
  );
  const [userId, setUserId] = useState<string>(shift.userId);
  const [positionId, setPositionId] = useState<string>(shift.positionId);
  const [loading, setLoading] = useState(false);
  const { allPositions: positions, allUsers: users } = useUserSettings();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    const newShift: NewShift = {
      startTime,
      endTime,
      userId,
      positionId,
    };

    try {
      const response = await fetch(`/api/shift?shiftId=${shift._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newShift),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to edit shift");

      console.log("Shift edited successfully");
      setStartTime("");
      setEndTime("");
      setUserId("");
      setPositionId("");
      setIsOpen(false);
      reloadScheduleCalendar();
      toast.success("Shift edited successfully");
      setLoading(false);
    } catch (error) {
      setLoading(false);
      console.error("Error editing shift:", error);
      toast.error("Failed to edit shift");
    }
  };

  const deleteShift = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/shift/delete?shiftId=${shift._id}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete shift");

      console.log("Shift deleted successfully");
      setIsOpen(false);
      reloadScheduleCalendar();
      toast.success("Shift deleted successfully");
      setLoading(false);
    } catch (error) {
      setLoading(false);
      console.error("Error deleting shift:", error);
      toast.error("Failed to delete shift");
    }
  };

  return (
    <DialogContent className={cn("sm:max-w-[425px]", "air-datepicker-global")}>
      <DialogHeader>
        <DialogTitle>Edit Shift</DialogTitle>
        <DialogDescription>Update the details for the shift.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} tabIndex={0}>
        <div className="grid gap-4 py-4" autoFocus={false}>
          <input type="hidden" autoFocus={true} />
          <StartTimeInput startTime={startTime} setStartTime={setStartTime} />
          <EndTimeInput endTime={endTime} setEndTime={setEndTime} />
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="userId" className="text-right">
              User
            </Label>
            <Select onValueChange={setUserId} value={userId}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem
                    key={user.id}
                    value={user.id}
                    className="hover:bg-accent focus:text-accent-foreground"
                  >
                    {user.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4 pointer-events-auto">
            <Label htmlFor="positionId" className="text-right">
              Position
            </Label>
            <Select onValueChange={setPositionId} value={positionId}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a position" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {positions.map((position) => (
                    <SelectItem
                      key={position._id}
                      value={position._id}
                      className="hover:bg-accent focus:text-accent-foreground"
                    >
                      {position.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <div className="col-span-4">
              <p className="text-xs text-right">
                {" "}
                Created by{" "}
                {
                  users.find((user) => user.id === shift.createdBy)?.firstName
                }{" "}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter
          style={{ justifyContent: "space-between", paddingTop: "1rem" }}
        >
          <Button
            disabled={loading}
            variant="destructive"
            onClick={(e) => deleteShift(e)}
          >
            {loading ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Delete"
            )}
          </Button>
          <Button disabled={loading} type="submit">
            {loading ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Update Shift"
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
