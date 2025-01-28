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
import { Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import AirDatepicker from "air-datepicker";
import "air-datepicker/air-datepicker.css";
import localeEn from "air-datepicker/locale/en";
import { NewShift } from "@/types/shiftTypes";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import { useUserSettings } from "@/providers/useUserSettings";
import { toast } from "sonner";
import { Popover } from "../ui/popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { CommandGroup } from "cmdk";
import * as chrono from "chrono-node";

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
  const [userPopOpen, setUserPopOpen] = useState(false);
  const [positionPopOpen, setPositionPopOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    type: userType,
    allPositions: positions,
    allUsers: users,
  } = useUserSettings();

  const startDatepickerRef = useRef<AirDatepicker | null>(null);
  const endDatepickerRef = useRef<AirDatepicker | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endTimeRef = useRef<HTMLInputElement | null>(null);

  const todayButton = {
    content: "Today",
    onClick: (dp: AirDatepicker) => {
      const date = new Date();
      dp.selectDate(date);
      dp.setViewDate(date);
    },
  };

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
        buttons: [todayButton, "clear"],
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
        buttons: [todayButton, "clear"],
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
      setLoading(false);
      console.log(data);
    } catch (error) {
      console.error("Error creating shift:", error);
      setLoading(false);
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
    <Dialog open={isOpen} onOpenChange={handleOpenChange} modal={false}>
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
                className="col-span-3 p-2 border rounded hover:bg-secondary/80 cursor-pointer"
                ref={startTimeRef}
                autoFocus={false}
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
                    endTimeRef.current.value = new Date(
                      endTime
                    ).toLocaleString();
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4 z-50">
              <Label htmlFor="userId" className="text-right">
                User
              </Label>
              <Popover
                open={userPopOpen}
                onOpenChange={setUserPopOpen}
                modal={false}
              >
                <PopoverTrigger asChild className="col-span-3">
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={userPopOpen}
                  >
                    {userId
                      ? users.find((user) => user.id === userId)?.firstName
                      : "Select a user"}
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[274px]">
                  <Command>
                    <CommandInput
                      placeholder="Search user..."
                      className="h-9"
                    />
                    <CommandList>
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup title="Users">
                        {users.map((user) => (
                          <CommandItem
                            key={user.firstName}
                            value={user.firstName}
                            onSelect={(currentValue) => {
                              setUserId(
                                currentValue === user.id ? "" : user.id
                              );
                              setUserPopOpen(false);
                            }}
                          >
                            {user.firstName}
                            <Check
                              className="w-4 h-4 ml-auto"
                              style={{
                                display: userId === user.id ? "block" : "none",
                              }}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="userId" className="text-right">
                Position
              </Label>
              <Popover
                open={positionPopOpen}
                onOpenChange={setPositionPopOpen}
                modal={false}
              >
                <PopoverTrigger asChild className="col-span-3">
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={positionPopOpen}
                  >
                    {positionId
                      ? positions.find(
                          (position) => position._id === positionId
                        )?.name
                      : "Select a position"}
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent asChild className="w-[274px]">
                  <Command>
                    <CommandInput
                      placeholder="Search position..."
                      className="h-9"
                    />
                    <CommandList>
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup title="Users">
                        {positions.map((position) => (
                          <CommandItem
                            key={position.name}
                            value={position.name}
                            onSelect={(currentValue) => {
                              setPositionId(
                                currentValue === position._id
                                  ? ""
                                  : position._id
                              );
                              setPositionPopOpen(false);
                            }}
                          >
                            {position.name}
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                positionId === position._id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={loading} type="submit">
              {loading ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Create Shift"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
