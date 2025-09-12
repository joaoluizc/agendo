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
  minTime?: number; // in minutes
  maxTime?: number; // in minutes
  stress?: boolean;
  requiredSkills?: string[]; // array of skill IDs
};

export type PositionSync = {
  positionId: string;
  sync: boolean;
};
