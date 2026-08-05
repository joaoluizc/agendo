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

/**
 * How one position resolves for one agent, from `GET /api/position/sync-rules`.
 *
 * Note `positionId` is the Mongo `Position._id` — the id a `Shift` carries and the key
 * of `allPositions` — *not* the Sling `Position.positionId` that `PositionSync` above is
 * keyed by. The backend resolves across the two id spaces so no client has to.
 */
export type PositionSyncRule = {
  positionId: string;
  /** An admin forced this position to sync for everyone. */
  enforced: boolean;
  /** The agent's own choice in Settings → shifts to add to calendar. */
  preference: boolean;
  /** `enforced || preference` — whether a shift here reaches their calendar. */
  willSync: boolean;
};
