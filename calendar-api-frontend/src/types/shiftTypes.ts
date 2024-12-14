export type Shift = {
  _id: string,
  userId: string,
  startTime: string,
  endTime: string,
  positionId: string,
  createdBy: string,
  isSynced: boolean,
};

export type SortedCalendar = {
  [key: string]: Shift[];
}

// export type SortedCalendar = {
//   [key: string]: Shift[] | NewShift[];
// }

export interface NewShift {
  startTime: string;
  endTime: string;
  userId: string;
  positionId: string;
}