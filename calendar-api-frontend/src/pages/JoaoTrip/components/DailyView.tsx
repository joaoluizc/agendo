// TRIP CALENDAR — Vertical timeline showing one day's events as cards.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import React from "react";
import { MapPin, Users } from "lucide-react";
import type { TripEvent } from "../types";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "../constants";

interface EventCardProps {
  event: TripEvent;
  isLast: boolean;
}

function EventCard({ event, isLast }: EventCardProps) {
  const colors = CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other;
  const timeLabel = event.endTime
    ? `${event.startTime} – ${event.endTime}`
    : event.startTime;

  return (
    <div style={{ display: "flex" }}>
      {/* Timeline spine */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 20,
          flexShrink: 0,
          paddingTop: 4,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: colors.dot,
            flexShrink: 0,
            zIndex: 1,
          }}
        />
        {!isLast && (
          <div
            style={{
              width: 1,
              flexGrow: 1,
              background: "#E5E7EB",
              marginTop: 3,
              minHeight: 16,
            }}
          />
        )}
      </div>

      {/* Card */}
      <div
        style={{
          flex: 1,
          marginLeft: 12,
          marginBottom: isLast ? 0 : 14,
          border: `0.5px solid ${colors.border}`,
          borderRadius: 10,
          padding: "11px 13px",
          background: "#fff",
        }}
      >
        {/* Time */}
        {timeLabel && (
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>
            {timeLabel}
          </div>
        )}

        {/* Event name */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: "#111827",
            lineHeight: 1.3,
            marginBottom: 6,
          }}
        >
          {event.eventName}
        </div>

        {/* Location */}
        {event.location && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 4,
              marginBottom: 4,
            }}
          >
            <MapPin
              size={11}
              color="#9CA3AF"
              style={{ marginTop: 1, flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.4 }}>
              {event.location}
            </span>
          </div>
        )}

        {/* People */}
        {event.people && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 4,
              marginBottom: 4,
            }}
          >
            <Users
              size={11}
              color="#9CA3AF"
              style={{ marginTop: 1, flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.4 }}>
              {event.people}
            </span>
          </div>
        )}

        {/* Notes */}
        {event.notes && (
          <div
            style={{
              fontSize: 12,
              color: "#9CA3AF",
              fontStyle: "italic",
              lineHeight: 1.4,
              marginBottom: 7,
            }}
          >
            {event.notes}
          </div>
        )}

        {/* Category badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              background: colors.bg,
              color: colors.text,
              border: `0.5px solid ${colors.border}`,
              borderRadius: 999,
              padding: "1px 8px",
              fontSize: 11,
            }}
          >
            {CATEGORY_LABELS[event.category] ?? event.category}
          </span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  events: TripEvent[];
}

export function DailyView({ events }: Props) {
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: "48px 20px",
          textAlign: "center",
          color: "#9CA3AF",
          fontSize: 14,
        }}
      >
        No events scheduled for this day.
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 20px 40px" }}>
      {events.map((event, i) => (
        <EventCard
          key={`${event.date}-${event.startTime}-${i}`}
          event={event}
          isLast={i === events.length - 1}
        />
      ))}
    </div>
  );
}
