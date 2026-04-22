// TRIP CALENDAR — TypeScript types for the NY trip calendar module.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

export type Category =
  | "transport"
  | "food"
  | "attraction"
  | "hotel"
  | "show"
  | "other";

export interface TripEvent {
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  eventName: string;
  category: Category;
  location: string;
  notes: string;
  cost: number;
  confirmed: boolean;
}

export type ViewMode = "daily" | "weekly";

export interface DayGroup {
  date: string;
  dayLabel: string;
  events: TripEvent[];
}
