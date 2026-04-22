// TRIP CALENDAR — Segmented control toggling between Daily and Weekly views.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import React from "react";
import type { ViewMode } from "../types";

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        background: "#F3F4F6",
        borderRadius: 8,
        padding: 2,
      }}
    >
      {(["daily", "weekly"] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            padding: "5px 14px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: mode === m ? 500 : 400,
            background: mode === m ? "#fff" : "transparent",
            color: mode === m ? "#111827" : "#6B7280",
            boxShadow:
              mode === m ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          {m === "daily" ? "Daily" : "Weekly"}
        </button>
      ))}
    </div>
  );
}
