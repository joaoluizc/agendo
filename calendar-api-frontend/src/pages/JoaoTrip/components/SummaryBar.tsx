// TRIP CALENDAR — Always-visible budget summary: spent vs budget, progress bar, category pills.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import React from "react";
import type { TripEvent, Category } from "../types";
import { CATEGORY_COLORS, CATEGORY_LABELS, TRIP_BUDGET } from "../constants";

interface Props {
  events: TripEvent[];
}

export function SummaryBar({ events }: Props) {
  const spent = events
    .filter((e) => e.confirmed)
    .reduce((sum, e) => sum + e.cost, 0);

  const planned = events.reduce((sum, e) => sum + e.cost, 0);
  const pct = Math.min(100, (spent / TRIP_BUDGET) * 100);
  const barColor = pct < 60 ? "#22C55E" : pct < 85 ? "#F59E0B" : "#EF4444";

  const byCategory = events.reduce(
    (acc, e) => {
      if (e.cost > 0) acc[e.category] = (acc[e.category] || 0) + e.cost;
      return acc;
    },
    {} as Record<Category, number>
  );

  const categoryOrder: Category[] = [
    "hotel",
    "show",
    "transport",
    "food",
    "attraction",
    "other",
  ];

  return (
    <div
      style={{
        padding: "14px 20px 12px",
        borderBottom: "0.5px solid #E5E7EB",
        background: "#fff",
      }}
    >
      {/* Budget row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          Budget · ${planned.toFixed(0)} planned
        </span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          <span style={{ color: "#111827" }}>${spent.toFixed(0)}</span>
          <span style={{ color: "#D1D5DB" }}> / ${TRIP_BUDGET}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          background: "#F3F4F6",
          borderRadius: 999,
          height: 3,
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: barColor,
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Category pills */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {categoryOrder
          .filter((cat) => byCategory[cat] > 0)
          .map((cat) => {
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
                {CATEGORY_LABELS[cat]} ${byCategory[cat].toFixed(0)}
              </span>
            );
          })}
      </div>
    </div>
  );
}
