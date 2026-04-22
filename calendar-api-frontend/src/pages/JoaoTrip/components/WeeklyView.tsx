// TRIP CALENDAR — Compact grid of every day; tapping an event pill jumps to that day in daily view.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import React from "react";
import { format, parseISO } from "date-fns";
import type { DayGroup, ViewMode } from "../types";
import { CATEGORY_COLORS } from "../constants";

interface Props {
  days: DayGroup[];
  onDaySelect: (date: string) => void;
  onViewChange: (mode: ViewMode) => void;
}

export function WeeklyView({ days, onDaySelect, onViewChange }: Props) {
  function handlePillClick(date: string) {
    onDaySelect(date);
    onViewChange("daily");
  }

  return (
    <div style={{ padding: "16px 16px 40px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
          gap: 10,
        }}
      >
        {days.map((day) => {
          let date: Date;
          try {
            date = parseISO(day.date);
          } catch {
            return null;
          }

          return (
            <div
              key={day.date}
              style={{
                border: "0.5px solid #E5E7EB",
                borderRadius: 10,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              {/* Day header */}
              <div
                style={{
                  padding: "8px 12px 7px",
                  borderBottom: "0.5px solid #F3F4F6",
                  background: "#FAFAFA",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#9CA3AF",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    marginBottom: 1,
                  }}
                >
                  {format(date, "EEE").toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#111827",
                    lineHeight: 1.2,
                  }}
                >
                  {format(date, "MMM d")}
                </div>
                {day.dayLabel && (
                  <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
                    {day.dayLabel}
                  </div>
                )}
              </div>

              {/* Event pills */}
              <div
                style={{
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {day.events.length === 0 ? (
                  <span style={{ fontSize: 11, color: "#D1D5DB" }}>
                    No events
                  </span>
                ) : (
                  day.events.map((event, i) => {
                    const colors =
                      CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other;
                    return (
                      <button
                        key={i}
                        onClick={() => handlePillClick(day.date)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          background: colors.bg,
                          border: `0.5px solid ${colors.border}`,
                          borderRadius: 6,
                          padding: "5px 8px",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: colors.dot,
                            flexShrink: 0,
                            marginTop: 3,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          {event.startTime && (
                            <div
                              style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 1 }}
                            >
                              {event.startTime}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: colors.text,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                          >
                            {event.eventName}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
