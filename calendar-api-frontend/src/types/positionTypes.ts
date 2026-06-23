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
};

export type PositionSync = {
  positionId: string;
  sync: boolean;
};
