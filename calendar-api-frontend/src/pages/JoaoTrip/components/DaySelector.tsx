// TRIP CALENDAR — Horizontally scrollable pill tabs for selecting the active day.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import React, { useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import type { DayGroup } from "../types";

interface Props {
  days: DayGroup[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export function DaySelector({ days, selectedDate, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const active = container.querySelector(
      "[data-active='true']"
    ) as HTMLElement | null;
    if (active) {
      active.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [selectedDate]);

  return (
    <div
      ref={scrollRef}
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        padding: "10px 20px",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {days.map((day) => {
        const active = day.date === selectedDate;
        let date: Date;
        try {
          date = parseISO(day.date);
        } catch {
          return null;
        }
        return (
          <button
            key={day.date}
            data-active={active}
            onClick={() => onSelect(day.date)}
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "6px 10px",
              borderRadius: 999,
              border: active ? "none" : "0.5px solid #E5E7EB",
              background: active ? "#111827" : "#fff",
              color: active ? "#fff" : "#374151",
              cursor: "pointer",
              minWidth: 44,
              gap: 1,
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.03em" }}>
              {format(date, "EEE").toUpperCase()}
            </span>
            <span style={{ fontSize: 17, fontWeight: active ? 500 : 400 }}>
              {format(date, "d")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
