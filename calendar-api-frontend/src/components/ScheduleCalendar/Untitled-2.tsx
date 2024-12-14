import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { NewShift } from "@/types/shiftTypes";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import { useUserSettings } from "@/providers/useUserSettings";
import { toast } from "sonner";

type NewShiftFormProps = {
  reloadScheduleCalendar: () => void;
  selectedDate: Date;
};

const THIRTY_MINUTES = 1800000;
const ONE_HOUR = 3600000;

export default function NewShiftForm({
  reloadScheduleCalendar,
  selectedDate,
}: NewShiftFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState<string>(
    new Date(
      Math.ceil(selectedDate.getTime() / THIRTY_MINUTES) * THIRTY_MINUTES
    ).toISOString()
  );
  const [endTime, setEndTime] = useState<string>(
    new Date(
      Math.ceil(selectedDate.getTime() / THIRTY_MINUTES) * THIRTY_MINUTES +
        ONE_HOUR
    ).toISOString()
  );
  const [userId, setUserId] = useState<string>("");
  const [positionId, setPositionId] = useState<string>("");
  const {
    type: userType,
    allPositions: positions,
    allUsers: users,
  } = useUserSettings();

  const startDatepickerRef = useRef<AirDatepicker | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endDatepickerRef = useRef<AirDatepicker | null>(null);

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
        selectedDates: [
          new Date(
            Math.ceil(selectedDate.getTime() / THIRTY_MINUTES) *
              THIRTY_MINUTES +
              THIRTY_MINUTES
          ),
        ],
        locale: localeEn,
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
      }
    );

    endDatepickerRef.current = new AirDatepicker(
      document.querySelector("#endTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setEndTime((date as Date).toISOString());
        },
        selectedDates: [
          new Date(
            Math.ceil(selectedDate.getTime() / THIRTY_MINUTES) *
              THIRTY_MINUTES +
              THIRTY_MINUTES +
              ONE_HOUR
          ),
        ],
        locale: localeEn,
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
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
    const newShift: NewShift = {
      startTime,
      endTime,
      userId,
      positionId,
    };

    let data: { message: string } = { message: "" };
    try {
      const response = await fetch("/api/shift/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newShift),
        credentials: "include", // Ensures that Clerk's authentication is included
      });

      if (!response.ok) throw new Error("Failed to create shift");

      data = await response.json();
      console.log(data);
    } catch (error) {
      console.error("Error creating shift:", error);
      return toast.error("Failed to create shift");
    }

    toast.success(data.message);

    setIsOpen(false); // Close the dialog

    // Reset form fields
    setStartTime("");
    setEndTime("");
    setUserId("");
    setPositionId("");
    reloadScheduleCalendar();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          style={{
            display: userType !== "admin" ? "none" : "block",
          }}
        >
          Create New Shift
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn("sm:max-w-[425px]", "air-datepicker-global")}
      >
        <DialogHeader>
          <DialogTitle>Create New Shift</DialogTitle>
          <DialogDescription>
            Enter the details for the new shift.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} tabIndex={0}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label
                htmlFor="startTime"
                className="text-right"
                autoFocus={false}
              >
                Start Time
              </Label>
              <Input
                id="startTime"
                className="col-span-3 p-2 border rounded"
                ref={startTimeRef}
                autoFocus={false}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endTime" className="text-right">
                End Time
              </Label>
              <Input id="endTime" className="col-span-3 p-2 border rounded" />
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
          </div>
          <DialogFooter>
            <Button type="submit">Create Shift</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
