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
import { useEffect, useRef, useState } from "react";
import localeEn from "air-datepicker/locale/en";
import AirDatepicker from "air-datepicker";
import { NewShift, Shift } from "@/types/shiftTypes";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { useUserSettings } from "@/providers/useUserSettings";
import { LoaderCircle } from "lucide-react";
import * as chrono from "chrono-node";

type EditShiftDialogProps = {
  shift: Shift;
  setIsOpen: (isOpen: boolean) => void;
  handleFunctionCreated?: (fn: (open: boolean) => void) => void;
  reloadScheduleCalendar: () => void;
};

export function EditShiftDialog(props: EditShiftDialogProps) {
  const { setIsOpen, handleFunctionCreated, shift, reloadScheduleCalendar } =
    props;
  const [startTime, setStartTime] = useState<string>(shift.startTime);
  const [endTime, setEndTime] = useState<string>(shift.endTime);
  const [userId, setUserId] = useState<string>(shift.userId);
  const [positionId, setPositionId] = useState<string>(shift.positionId);
  const [loading, setLoading] = useState(false);
  const { allPositions: positions, allUsers: users } = useUserSettings();

  const startDatepickerRef = useRef<AirDatepicker | null>(null);
  const endDatepickerRef = useRef<AirDatepicker | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endTimeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Blur the input field after rendering to avoid pre-focusing
    if (startTimeRef.current) {
      startTimeRef.current.blur();
    }
  }, []);

  useEffect(() => {
    if (handleFunctionCreated) {
      handleFunctionCreated(handleOpenChange);
    }
  }, [handleFunctionCreated]);

  const initializeDatepickers = () => {
    if (startDatepickerRef.current) startDatepickerRef.current.destroy();
    if (endDatepickerRef.current) endDatepickerRef.current.destroy();

    startDatepickerRef.current = new AirDatepicker(
      document.querySelector("#startTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setStartTime((date as Date).toISOString());
        },
        selectedDates: [new Date(startTime)],
        locale: localeEn,
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: ["today", "clear"],
      }
    );

    endDatepickerRef.current = new AirDatepicker(
      document.querySelector("#endTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setEndTime((date as Date).toISOString());
        },
        selectedDates: [new Date(endTime)],
        locale: localeEn,
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: ["today", "clear"],
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Initialize datepickers when dialog opens
      setTimeout(initializeDatepickers, 0);
    }
  };

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
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="startTime" className="text-right">
              Start Time
            </Label>
            <Input
              id="startTime"
              className="col-span-3 p-2 border rounded cursor-pointer hover:bg-secondary/80"
              ref={startTimeRef}
              onChange={(e) => {
                const parsedDate = chrono.parseDate(e.target.value);
                if (parsedDate) {
                  setStartTime(parsedDate.toISOString());
                }
              }}
              onBlur={() => {
                if (startTimeRef.current) {
                  startTimeRef.current.value = new Date(
                    startTime
                  ).toLocaleString();
                }
              }}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="endTime" className="text-right">
              End Time
            </Label>
            <Input
              id="endTime"
              className="col-span-3 p-2 border rounded hover:bg-secondary/80 cursor-pointer"
              ref={endTimeRef}
              onChange={(e) => {
                const parsedDate = chrono.parseDate(e.target.value);
                if (parsedDate) {
                  setEndTime(parsedDate.toISOString());
                }
              }}
              onBlur={() => {
                if (endTimeRef.current) {
                  endTimeRef.current.value = new Date(endTime).toLocaleString();
                }
              }}
            />
          </div>
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
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
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
                    <SelectItem key={position._id} value={position._id}>
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
          <Button disabled={loading} variant="destructive" onClick={(e) => deleteShift(e)}>
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
