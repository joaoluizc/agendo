// TRIP CALENDAR — Category color palette and budget constant.
// To remove: delete the entire src/pages/JoaoTrip/ directory and the two joao-trip lines in main.tsx.

import type { Category } from "./types";

export interface CategoryColors {
  dot: string;
  bg: string;
  text: string;
  border: string;
}

export const CATEGORY_COLORS: Record<Category, CategoryColors> = {
  transport:  { dot: "#3B82F6", bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  food:       { dot: "#22C55E", bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  attraction: { dot: "#A855F7", bg: "#FAF5FF", text: "#7E22CE", border: "#E9D5FF" },
  hotel:      { dot: "#F59E0B", bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  show:       { dot: "#EC4899", bg: "#FDF2F8", text: "#BE185D", border: "#FBCFE8" },
  other:      { dot: "#9CA3AF", bg: "#F9FAFB", text: "#4B5563", border: "#E5E7EB" },
};

export const CATEGORY_LABELS: Record<Category, string> = {
  transport:  "Transport",
  food:       "Food",
  attraction: "Attraction",
  hotel:      "Hotel",
  show:       "Show",
  other:      "Other",
};

