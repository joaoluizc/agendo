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
  endDate: string;
  startTime: string;
  endTime: string;
  eventName: string;
  category: Category;
  location: string;
  notes: string;
  people: string;
}

export type ViewMode = "daily" | "weekly";

export interface DayGroup {
  date: string;
  events: TripEvent[];
}
