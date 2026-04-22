// TRIP CALENDAR — Fetches the NY trip Google Sheet (published as CSV), parses it, and returns JSON.
// To remove: delete this file, src/routers/tripCalendarRouter.js, and the two trip-calendar lines in app.js.

import process from "process";

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );
  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const values = parseCSVLine(line);
      return headers.reduce((obj, header, i) => {
        obj[header] = values[i] ?? "";
        return obj;
      }, {});
    });
}

export async function getTripCalendar(req, res) {
  const sheetUrl = process.env.TRIP_CALENDAR_SHEET_URL;
  if (!sheetUrl) {
    return res
      .status(503)
      .json({ error: "TRIP_CALENDAR_SHEET_URL is not configured" });
  }

  try {
    const response = await fetch(sheetUrl);
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch sheet data" });
    }
    const csvText = await response.text();
    const rows = parseCSV(csvText);

    const events = rows
      .filter((row) => row.date)
      .map((row) => ({
        date: row.date || "",
        dayLabel: row.day_label || "",
        startTime: row.start_time || "",
        endTime: row.end_time || "",
        eventName: row.event_name || "",
        category: row.category || "other",
        location: row.location || "",
        notes: row.notes || "",
        cost: parseFloat(row.cost) || 0,
        confirmed:
          row.confirmed?.toLowerCase() === "yes" ||
          row.confirmed?.toLowerCase() === "true",
      }));

    res.json(events);
  } catch (err) {
    console.error("[trip-calendar] fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
