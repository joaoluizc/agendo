// TRIP CALENDAR — Time-grid view: all hours always visible, events span their duration.
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

const START_HOUR = 6;
const END_HOUR = 23;
const PX_PER_HOUR = 64;
const PX_PER_MIN = PX_PER_HOUR / 60;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const HOUR_COL_WIDTH = 44;
const DAY_COL_WIDTH = 130;
const HEADER_HEIGHT = 48;

function parseTimeToMinutes(time: string): number | null {
  if (!time) return null;
  const m24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const m12 = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]);
    const min = parseInt(m12[2]);
    const isPM = m12[3].toUpperCase() === "PM";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + min;
  }
  return null;
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

export function WeeklyView({ days, onDaySelect, onViewChange }: Props) {
  function handleEventClick(date: string) {
    onDaySelect(date);
    onViewChange("daily");
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden" }}>
      <div
        style={{
          display: "flex",
          minWidth: HOUR_COL_WIDTH + days.length * DAY_COL_WIDTH,
        }}
      >
        {/* Hours column */}
        <div
          style={{
            width: HOUR_COL_WIDTH,
            flexShrink: 0,
            borderRight: "0.5px solid #E5E7EB",
            background: "#fff",
          }}
        >
          {/* Corner spacer */}
          <div style={{ height: HEADER_HEIGHT, borderBottom: "0.5px solid #E5E7EB" }} />

          {/* Hour labels */}
          {HOURS.map((h) => (
            <div
              key={h}
              style={{
                height: PX_PER_HOUR,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                paddingRight: 8,
                paddingTop: 4,
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "#9CA3AF",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                }}
              >
                {formatHour(h)}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          let date: Date;
          try {
            date = parseISO(day.date);
          } catch {
            return null;
          }

          const timedEvents = day.events.filter((e) => parseTimeToMinutes(e.startTime) !== null);
          const untimedEvents = day.events.filter((e) => parseTimeToMinutes(e.startTime) === null);

          return (
            <div
              key={day.date}
              style={{
                width: DAY_COL_WIDTH,
                flexShrink: 0,
                borderRight: "0.5px solid #E5E7EB",
              }}
            >
              {/* Day header */}
              <div
                style={{
                  height: HEADER_HEIGHT,
                  padding: "8px 10px 6px",
                  borderBottom: "0.5px solid #E5E7EB",
                  background: "#FAFAFA",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "#9CA3AF",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    marginBottom: 2,
                  }}
                >
                  {format(date, "EEE").toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#111827",
                    lineHeight: 1.2,
                  }}
                >
                  {format(date, "MMM d")}
                </div>
                {untimedEvents.length > 0 && (
                  <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 1 }}>
                    +{untimedEvents.length} all-day
                  </div>
                )}
              </div>

              {/* Time grid */}
              <div
                style={{
                  position: "relative",
                  height: TOTAL_HEIGHT,
                  background: "#fff",
                }}
              >
                {/* Hour lines */}
                {HOURS.map((h, i) => (
                  <div
                    key={h}
                    style={{
                      position: "absolute",
                      top: i * PX_PER_HOUR,
                      left: 0,
                      right: 0,
                      borderTop: `0.5px solid ${i === 0 ? "#E5E7EB" : "#F3F4F6"}`,
                      pointerEvents: "none",
                    }}
                  />
                ))}

                {/* Half-hour lines */}
                {HOURS.map((h, i) => (
                  <div
                    key={`half-${h}`}
                    style={{
                      position: "absolute",
                      top: i * PX_PER_HOUR + PX_PER_HOUR / 2,
                      left: 0,
                      right: 0,
                      borderTop: "0.5px dashed #F3F4F6",
                      pointerEvents: "none",
                    }}
                  />
                ))}

                {/* Timed events */}
                {timedEvents.map((event, ei) => {
                  const startMins = parseTimeToMinutes(event.startTime) ?? START_HOUR * 60;
                  const endMins =
                    parseTimeToMinutes(event.endTime) ?? startMins + 60;
                  const clampedStart = Math.max(startMins, START_HOUR * 60);
                  const clampedEnd = Math.min(endMins, END_HOUR * 60);
                  const top = (clampedStart - START_HOUR * 60) * PX_PER_MIN;
                  const height = Math.max(20, (clampedEnd - clampedStart) * PX_PER_MIN);
                  const colors =
                    CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other;

                  return (
                    <button
                      key={ei}
                      onClick={() => handleEventClick(day.date)}
                      title={`${event.eventName}${event.startTime ? ` · ${event.startTime}` : ""}${event.endTime ? ` – ${event.endTime}` : ""}`}
                      style={{
                        position: "absolute",
                        top,
                        left: 3,
                        right: 3,
                        height,
                        background: colors.bg,
                        border: `0.5px solid ${colors.border}`,
                        borderLeft: `3px solid ${colors.dot}`,
                        borderRadius: 5,
                        padding: "3px 5px",
                        overflow: "hidden",
                        cursor: "pointer",
                        textAlign: "left",
                        boxSizing: "border-box",
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: colors.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                        }}
                      >
                        {event.eventName}
                      </div>
                      {height > 28 && event.startTime && (
                        <div
                          style={{
                            fontSize: 9,
                            color: colors.dot,
                            marginTop: 1,
                            lineHeight: 1,
                          }}
                        >
                          {event.startTime}
                          {event.endTime ? ` – ${event.endTime}` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
