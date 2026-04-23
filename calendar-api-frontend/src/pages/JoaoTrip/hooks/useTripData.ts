// TRIP CALENDAR — Fetches event data from /api/trip-calendar and groups it by day.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import { useState, useEffect } from "react";
import type { TripEvent, DayGroup } from "../types";

interface UseTripDataResult {
  events: TripEvent[];
  days: DayGroup[];
  loading: boolean;
  error: string | null;
}

export function useTripData(): UseTripDataResult {
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/trip-calendar")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<TripEvent[]>;
      })
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const dayMap = new Map<string, DayGroup>();
  for (const event of events) {
    if (!dayMap.has(event.date)) {
      dayMap.set(event.date, {
        date: event.date,
        events: [],
      });
    }
    dayMap.get(event.date)!.events.push(event);
  }
  const days = Array.from(dayMap.values());

  return { events, days, loading, error };
}
