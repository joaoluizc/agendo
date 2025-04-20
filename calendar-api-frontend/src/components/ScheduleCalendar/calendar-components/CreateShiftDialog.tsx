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
import { Shift } from "@/types/shiftTypes";
import { cn } from "@/lib/utils";
import { Input } from "../../ui/input";
import { useUserSettings } from "@/providers/useUserSettings";
import { toast } from "sonner";
import { Popover } from "../../ui/popover";
import { PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command";
import { CommandGroup } from "cmdk";
import * as chrono from "chrono-node";
import { todayButton } from "./today-button-datepicker";
import useAddShiftToSchedule from "@/hooks/useAddShiftToSchedule";
import { Badge } from "@/components/ui/badge";

type NewShiftFormProps = {
  selectedDate: Date;
  children: React.ReactNode;
  selectedUserId: string;
};

const ONE_HOUR = 3600000;

const localeStringOptions: { dateStyle: "short"; timeStyle: "short" } = {
  dateStyle: "short",
  timeStyle: "short",
};

export default function CreateShiftDialog({
  selectedDate,
  selectedUserId,
  children,
}: NewShiftFormProps) {
  const addShiftsToSchedule = useAddShiftToSchedule();
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState<string>(
    selectedDate.toLocaleString(undefined, localeStringOptions)
  );
  const [endTime, setEndTime] = useState<string>(
    new Date(selectedDate.getTime() + ONE_HOUR).toLocaleString(
      undefined,
      localeStringOptions
    )
  );

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([
    selectedUserId,
  ]);
  const [positionId, setPositionId] = useState<string>("");
  const [userPopOpen, setUserPopOpen] = useState(false);
  const [positionPopOpen, setPositionPopOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { allPositions: positions, allUsers: users } = useUserSettings();

  const startDatepickerRef = useRef<AirDatepicker | null>(null);
  const endDatepickerRef = useRef<AirDatepicker | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endTimeRef = useRef<HTMLInputElement | null>(null);

  const [fieldsValidation, setFieldsValidation] = useState({
    startTime: false,
    endTime: false,
    userIds: false,
    positionId: false,
  });

  const initializeDatepickers = () => {
    if (startDatepickerRef.current) startDatepickerRef.current.destroy();
    if (endDatepickerRef.current) endDatepickerRef.current.destroy();

    startDatepickerRef.current = new AirDatepicker(
      document.querySelector("#startTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setStartTime(
            (date as Date).toLocaleString(undefined, localeStringOptions)
          );
        },
        selectedDates: [selectedDate],
        locale: localeEn,
        dateFormat: "M/d/yy,",
        timeFormat: "h:mm AA",
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: [todayButton, "clear"],
        toggleSelected: false,
        keyboardNav: false,
      }
    );
    setTimeout(() => {
      setStartTime(selectedDate.toLocaleString(undefined, localeStringOptions));
    }, 500);

    endDatepickerRef.current = new AirDatepicker(
      document.querySelector("#endTime") as HTMLInputElement,
      {
        timepicker: true,
        onSelect: ({ date }) => {
          setEndTime(
            (date as Date).toLocaleString(undefined, localeStringOptions)
          );
        },
        selectedDates: [new Date(selectedDate.getTime() + ONE_HOUR)],
        locale: localeEn,
        dateFormat: "M/d/yy,",
        timeFormat: "h:mm AA",
        position: "bottom left",
        container: ".air-datepicker-global",
        minutesStep: 30,
        buttons: [todayButton, "clear"],
        toggleSelected: false,
        keyboardNav: false,
      }
    );
  };

  const handleStartTimeChange = () => {
    const parsedDate = chrono.parseDate(startTime);
    if (parsedDate) {
      setStartTime(parsedDate.toLocaleString(undefined, localeStringOptions));
    } else {
      setStartTime("Invalid date");
    }
  };

  const handleEndTimeChange = () => {
    const parsedDate = chrono.parseDate(endTime);
    if (parsedDate) {
      setEndTime(parsedDate.toLocaleString(undefined, localeStringOptions));
    } else {
      setEndTime("Invalid date");
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Initialize datepickers when dialog opens
      setTimeout(initializeDatepickers, 0);
    }
  };

  const validateFields = () => {
    const newFieldsValidation = { ...fieldsValidation };
    let isValid = true;

    const startTimeParsed = chrono.parseDate(startTime);
    const endTimeParsed = chrono.parseDate(endTime);

    if (!startTimeParsed) {
      console.log("Invalid start time:", startTime);
      newFieldsValidation.startTime = true;
      isValid = false;
      toast.error("Invalid start time");
    } else {
      newFieldsValidation.startTime = false;
    }

    if (!endTimeParsed) {
      console.log("Invalid end time:", endTime);
      newFieldsValidation.endTime = true;
      isValid = false;
      toast.error("Invalid end time");
    } else {
      newFieldsValidation.endTime = false;
    }

    if (
      new Date(startTimeParsed!).getTime() >= new Date(endTimeParsed!).getTime()
    ) {
      console.log("End time is before start time");
      newFieldsValidation.endTime = true;
      isValid = false;
      toast.error("End time is before start time");
    } else {
      newFieldsValidation.endTime = false;
    }

    if (selectedUserIds.length === 0) {
      newFieldsValidation.userIds = true;
      isValid = false;
      toast.error("Please select a user");
    } else {
      newFieldsValidation.userIds = false;
    }

    if (!positionId) {
      newFieldsValidation.positionId = true;
      isValid = false;
      toast.error("Please select a position");
    } else {
      newFieldsValidation.positionId = false;
    }

    setFieldsValidation(newFieldsValidation);

    if (isValid) {
      return {
        startTime: new Date(startTimeParsed!).toISOString(),
        endTime: new Date(endTimeParsed!).toISOString(),
        userIds: selectedUserIds,
        positionId,
      };
    } else {
      return null;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const newShift = validateFields();
    if (!newShift) return;
    setLoading(true);

    let responseData: { message: string; details: string; data: Shift[] } = {
      message: "",
      details: "",
      data: [{}] as Shift[],
    };

    try {
      const response = await fetch("/api/shift/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newShift),
        credentials: "include", // Ensures that Clerk's authentication is included
      });

      responseData = await response.json();

      if (!response.ok) {
        throw new Error("Failed to create shift");
      }

      setLoading(false);
      console.log(responseData);
    } catch (error) {
      if (responseData.message && responseData.details) {
        console.error(
          "Error creating shift:",
          responseData.message,
          responseData.details
        );
        setLoading(false);
        return toast.error(responseData.message, {
          description: responseData.details,
        });
      }
      console.error("Error creating shift:", error);
      setLoading(false);
      return toast.error("Failed to create shift");
    }

    toast.success(responseData.message, {
      description: responseData.details,
    });

    setIsOpen(false); // Close the dialog

    // Reset form fields
    setStartTime(selectedDate.toLocaleString(undefined, localeStringOptions));
    setEndTime(
      new Date(selectedDate.getTime() + ONE_HOUR).toLocaleString(
        undefined,
        localeStringOptions
      )
    );
    setSelectedUserIds([selectedUserId]);
    setPositionId("");

    // Check if the created shift's date matches the selected date on the rendered schedule
    const shiftDate = new Date(responseData.data[0].startTime);
    const scheduleDate = new Date(selectedDate);
    if (
      shiftDate.getDate() !== scheduleDate.getDate() ||
      shiftDate.getMonth() !== scheduleDate.getMonth() ||
      shiftDate.getFullYear() !== scheduleDate.getFullYear()
    ) {
      return;
    }

    const createdShifts = responseData.data;

    for (const shift of createdShifts) {
      addShiftsToSchedule(shift);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} modal={false}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn(
          "sm:max-w-[425px]",
          "air-datepicker-global",
          "pointer-events-auto"
        )}
      >
        <DialogHeader>
          <DialogTitle>Create New Shift</DialogTitle>
          <DialogDescription>
            Enter the details for the new shift.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} tabIndex={0}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-x-4 gap-y-1">
              <Label
                htmlFor="startTime"
                className="text-right"
                autoFocus={false}
              >
                Start Time
              </Label>
              <>
                <Input
                  id="startTime"
                  className={cn(
                    "p-2 border rounded hover:bg-secondary/80 cursor-pointer",
                    fieldsValidation.startTime ? "border-red-500" : ""
                  )}
                  ref={startTimeRef}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                  }}
                  onFocus={() => {}}
                  onBlur={() => {
                    handleStartTimeChange();
                  }}
                  value={startTime}
                />
                {fieldsValidation.startTime && (
                  <span className="text-red-500 text-xs col-span-3 col-start-2">
                    Please enter a valid date
                  </span>
                )}
              </>
            </div>
            <div className="grid grid-cols-4 items-center gap-x-4 gap-y-1">
              <Label htmlFor="endTime" className="text-right">
                End Time
              </Label>
              <>
                <Input
                  id="endTime"
                  className={cn(
                    "p-2 border rounded hover:bg-secondary/80 cursor-pointer",
                    fieldsValidation.endTime ? "border-red-500" : ""
                  )}
                  ref={endTimeRef}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                  }}
                  onBlur={() => {
                    handleEndTimeChange();
                  }}
                  value={endTime}
                />
                {fieldsValidation.endTime && (
                  <span className="text-red-500 text-xs col-span-3 col-start-2">
                    Please enter a valid date
                  </span>
                )}
              </>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="userId" className="text-right">
                Users
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
                    className="h-auto"
                  >
                    <div className="flex flex-wrap gap-y-1">
                      {selectedUserIds.length > 0
                        ? selectedUserIds.map((id) => (
                            <Badge
                              variant="secondary"
                              className="mr-1"
                              key={id}
                            >
                              {users.find((user) => user.id === id)?.firstName}
                            </Badge>
                          ))
                        : "Select users"}
                    </div>
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[274px] pointer-events-auto">
                  <Command className="pointer-events-auto">
                    <CommandInput
                      placeholder="Search user..."
                      className="h-9 pointer-events-auto"
                    />
                    <CommandList>
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup title="Users">
                        {users.map((user) => (
                          <CommandItem
                            key={user.firstName}
                            value={user.firstName}
                            className="pointer-events-auto"
                            onSelect={() => {
                              setSelectedUserIds((prev) =>
                                prev.includes(user.id)
                                  ? prev.filter((id) => id !== user.id)
                                  : [...prev, user.id]
                              );
                            }}
                          >
                            {user.firstName}
                            <Check
                              className="w-4 h-4 ml-auto"
                              style={{
                                display: selectedUserIds.includes(user.id)
                                  ? "block"
                                  : "none",
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
            <div
              id="position-select"
              className="grid grid-cols-4 items-center gap-x-4 gap-y-1"
            >
              <Label htmlFor="position-select" className="text-right">
                Position
              </Label>
              <Popover
                open={positionPopOpen}
                onOpenChange={setPositionPopOpen}
                modal={false}
              >
                <PopoverTrigger className="col-span-3">
                  <div className="">
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={positionPopOpen}
                      className={cn(
                        "w-full",
                        fieldsValidation.positionId ? "border-red-500" : ""
                      )}
                      type="button"
                    >
                      {positionId
                        ? positions.find(
                            (position) => position._id === positionId
                          )?.name
                        : "Select a position"}
                      <ChevronsUpDown className="opacity-50" />
                    </Button>
                    {fieldsValidation.positionId && (
                      <span className="text-red-500 text-xs col-span-3 col-start-2">
                        Please select a position
                      </span>
                    )}
                  </div>
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
        </form>
        <DialogFooter>
          <Button disabled={loading} onClick={handleSubmit}>
            {loading ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin/g" />
            ) : (
              "Create Shift"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
