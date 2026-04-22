// TRIP CALENDAR — Root page for the NY trip calendar, served at /joao-trip.
// Self-contained module: no shared state, no global styles, no auth required.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import React, { useState, useEffect } from "react";
import { useTripData } from "./hooks/useTripData";
import { SummaryBar } from "./components/SummaryBar";
import { ViewToggle } from "./components/ViewToggle";
import { DaySelector } from "./components/DaySelector";
import { DailyView } from "./components/DailyView";
import { WeeklyView } from "./components/WeeklyView";
import type { ViewMode } from "./types";

export default function JoaoTrip() {
  const { events, days, loading, error } = useTripData();
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState<string>("");

  useEffect(() => {
    if (days.length > 0 && !selectedDate) {
      setSelectedDate(days[0].date);
    }
  }, [days, selectedDate]);

  const selectedDay = days.find((d) => d.date === selectedDate);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAFAFA",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <span style={{ color: "#9CA3AF", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAFAFA",
          fontFamily: "system-ui, -apple-system, sans-serif",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={{ color: "#EF4444", fontSize: 14 }}>
          Failed to load trip data
        </span>
        <span style={{ color: "#9CA3AF", fontSize: 12 }}>{error}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#FAFAFA",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Sticky top bar: title + toggle + summary + day selector */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#fff",
          borderBottom: viewMode === "daily" ? "none" : "0.5px solid #E5E7EB",
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px 12px",
            borderBottom: "0.5px solid #E5E7EB",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#111827" }}>
              NYC Trip
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 1 }}>
              {days.length} day{days.length !== 1 ? "s" : ""} · {events.length}{" "}
              event{events.length !== 1 ? "s" : ""}
            </div>
          </div>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* Budget summary */}
        <SummaryBar events={events} />

        {/* Day selector — daily view only */}
        {viewMode === "daily" && days.length > 0 && (
          <DaySelector
            days={days}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />
        )}
      </div>

      {/* Page content */}
      {viewMode === "daily" ? (
        <DailyView events={selectedDay?.events ?? []} />
      ) : (
        <WeeklyView
          days={days}
          onDaySelect={setSelectedDate}
          onViewChange={setViewMode}
        />
      )}
    </div>
  );
}
