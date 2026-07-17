export type Position = {
  _id: string;
  positionId?: string;
  name: string;
  type:
    | "live channel"
    | "tickets"
    | "meeting"
    | "break"
    | "development"
    | "training";
  color: string;
  sync: boolean;
  enforceSync?: boolean; // admin-forced: always synced for every user
  // Google Calendar event colorId ("1".."11") the user picked for this shift.
  // null/undefined => no color => Google uses the calendar's default color.
  colorId?: string | null;
};

export type PositionSync = {
  positionId: string;
  sync: boolean;
  colorId?: string | null;
};
