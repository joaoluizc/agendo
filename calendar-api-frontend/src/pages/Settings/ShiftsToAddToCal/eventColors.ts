// The fixed palette of Google Calendar event colors. Google's API only accepts
// these 11 predefined colorIds ("1".."11") on an event — arbitrary hex is not
// supported (see https://developers.google.com/workspace/calendar/api/v3/reference/colors).
// Hex values mirror what Google renders so our swatches match the calendar.
// NOTE: unrelated to ManagePositions' DEFAULT_COLORS (an arbitrary-hex display palette).

export type GCalEventColor = {
  id: string; // Google colorId, "1".."11"
  hex: string; // background color Google renders
};

export const GCAL_EVENT_COLORS: GCalEventColor[] = [
  { id: "1", hex: "#7986CB" }, // Lavender
  { id: "2", hex: "#33B679" }, // Sage
  { id: "3", hex: "#8E24AA" }, // Grape
  { id: "4", hex: "#E67C73" }, // Flamingo
  { id: "5", hex: "#F6BF26" }, // Banana
  { id: "6", hex: "#F4511E" }, // Tangerine
  { id: "7", hex: "#039BE5" }, // Peacock
  { id: "8", hex: "#616161" }, // Graphite
  { id: "9", hex: "#3F51B5" }, // Blueberry
  { id: "10", hex: "#0B8043" }, // Basil
  { id: "11", hex: "#D50000" }, // Tomato
];

// Resolve a colorId to its hex, or undefined when there's no (valid) color.
export function hexForColorId(
  colorId: string | null | undefined
): string | undefined {
  if (!colorId) return undefined;
  return GCAL_EVENT_COLORS.find((c) => c.id === colorId)?.hex;
}
