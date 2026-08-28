import { GCalendarEvent } from "./gCalendarTypes";

/**
 * A shift is a draft until an admin publishes it. Only publishing puts it on an agent's
 * Google Calendar and counts it as time worked.
 */
export type ShiftStatus = "draft" | "published";

export type Shift = {
  _id: string,
  userId: string,
  startTime: string,
  endTime: string,
  positionId: string,
  createdBy: string,
  /**
   * Absent on shifts written before the draft lifecycle existed. Read it through
   * `isDraft` rather than comparing directly — a missing status means published, and
   * assuming otherwise turns real history into drafts.
   */
  status?: ShiftStatus,
  /** "ui" for a shift someone created by hand, or the name of the posting integration. */
  source?: string,
  /** Free text from whatever produced the shift, shown when reviewing a draft. */
  notes?: string,
  publishedAt?: string,
  isSynced: boolean,
  syncedEvent: GCalendarEvent,
};

export type SortedCalendar = {
  [key: string]: Shift[];
}

export interface NewShift {
  _id?: string;
  startTime: string;
  endTime: string;
  userId: string;
  positionId: string;
}

export interface ShiftInDrag {
  isBeingDragged: boolean;
  data: Shift | null;
}

/**
 * A grid gesture waiting on the user's answer.
 *
 * Dragging a shift to a new time, resizing it by an edge, or shrinking it out of existence
 * all produce one of these. The gesture itself is unambiguous; what it cannot say is
 * whether the result should reach the agent's calendar — so it is parked here and a single
 * prompt asks. See `calendar-components/PendingChangePrompt`.
 */
export type PendingShiftChange = {
  /** `"delete"` when the shift was shrunk past its own minimum. */
  intent: "retime" | "delete";
  /** The shift as it was before the gesture, used to undo the optimistic grid patch. */
  shift: Shift;
  startTime: string;
  endTime: string;
  /** Differs from `shift.userId` when the shift was dragged onto another agent. */
  userId: string;
  /** What the gesture did, e.g. `Chats · 09:00–13:00 → 09:00–12:45`. Shown in the prompt. */
  summary: string;
  /**
   * A second line for a change the summary cannot carry without becoming a paragraph —
   * currently only "who to whom" when a drag moved the shift to a different agent.
   */
  detail?: string;
};
