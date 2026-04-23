// TRIP CALENDAR — Summary bar showing event counts per category.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import React from "react";
import type { TripEvent, Category } from "../types";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "../constants";

interface Props {
  events: TripEvent[];
}

const CATEGORY_ORDER: Category[] = [
  "hotel",
  "transport",
  "show",
  "attraction",
  "food",
  "other",
];

export function SummaryBar({ events }: Props) {
  const countByCategory = events.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + 1;
      return acc;
    },
    {} as Record<Category, number>
  );

  const activeCats = CATEGORY_ORDER.filter((cat) => countByCategory[cat] > 0);

  return (
    <div
      style={{
        padding: "12px 20px",
        borderBottom: "0.5px solid #E5E7EB",
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#9CA3AF",
          marginBottom: 8,
          fontWeight: 500,
          letterSpacing: "0.04em",
        }}
      >
        {events.length} event{events.length !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {activeCats.map((cat) => {
          const c = CATEGORY_COLORS[cat];
          return (
            <span
              key={cat}
              style={{
                background: c.bg,
                color: c.text,
                border: `0.5px solid ${c.border}`,
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {CATEGORY_LABELS[cat]} · {countByCategory[cat]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
