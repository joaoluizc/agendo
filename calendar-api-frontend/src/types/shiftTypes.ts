import { GCalendarEvent } from "./gCalendarTypes";

export type Shift = {
  _id: string,
  userId: string,
  startTime: string,
  endTime: string,
  positionId: string,
  createdBy: string,
  isSynced: boolean,
  syncedEvent: GCalendarEvent,
};

export type SortedCalendar = {
  [key: string]: Shift[];
}

export interface NewShift {
  startTime: string;
  endTime: string;
  userId: string;
  positionId: string;
}