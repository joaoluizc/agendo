/**
 * Turns text pasted from a spreadsheet export into per-agent rows. Copying a range out of
 * Google Sheets gives tab-separated text; a downloaded export gives CSV. Both work, with
 * or without a header row (columns are found by header name first, by position otherwise).
 *
 * Pure: nothing here knows about users, periods or the database.
 */
import { normalizeName } from "./names.js";

/** What each import source carries. `count`-less hours rows are their own source. */
export const SOURCES = {
  tickets: {
    label: "Tickets",
    fields: ["count", "csat", "surveys", "good", "bad"],
    positional: ["name", "count", "csat", "surveys"],
  },
  chats: {
    label: "Chats",
    fields: ["count", "csat", "surveys", "good", "bad"],
    positional: ["name", "count", "csat", "surveys"],
  },
  screenshares: {
    label: "Screen-shares",
    fields: ["count", "csat", "surveys"],
    positional: ["name", "count", "csat"],
  },
  hours: {
    label: "Hours",
    fields: ["chatsHours", "ticketsHours"],
    positional: ["name", "chatsHours", "ticketsHours"],
  },
};

// Exact (normalized) header names. Exact on purpose: the quarterly sheet has both
// "Surveys" and "Total Surveys" on the same tab, and they mean different things.
const HEADERS = {
  email: ["email", "e-mail", "agent email"],
  csat: ["csat", "csat %", "satisfaction"],
  surveys: ["surveys", "# surveys", "survey count"],
  good: ["good ratings", "good", "# good"],
  bad: ["bad ratings", "bad", "# bad"],
  chatsHours: ["chat hours", "chats hours", "chat shifts"],
  ticketsHours: ["ticket hours", "tickets hours", "ticket shifts", "tickets shifts"],
};
const COUNT_HEADERS = {
  tickets: ["# solved tickets", "solved tickets", "solved", "tickets", "tickets solved", "count"],
  chats: ["served", "chats", "chats served", "chats handled", "count"],
  screenshares: ["served", "screen-shares", "screenshares", "screen shares", "count"],
};
const NAME_HEADERS = ["name", "agent", "agent name", "assignee", "ticket assignee"];
const EMPTY = /^(|-|—|n\/a|na|none|#div\/0!|#n\/a|#value!|#ref!|#error!)$/i;
const SUMMARY_ROW = /^(total|grand total|average|avg|sum)\b/i;

function normalizeHeader(cell) {
  return String(cell || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Splits delimited text into rows of cells, honouring quotes (and newlines inside them). */
export function splitRows(text) {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  const firstLine = source.split("\n").find((l) => l.trim()) || "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push({ line: rowLine, cells: row });
      row = [];
      cell = "";
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push({ line: rowLine, cells: row });
  }
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ""));
}

/** "1,070" → 1070, "93,5" → 93.5, "1.234,5" → 1234.5; blanks and sheet errors → null. */
export function parseNumber(raw) {
  let s = String(raw ?? "").trim();
  if (EMPTY.test(s)) return { value: null };
  s = s.replace(/[\s\u00a0]/g, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const value = Number(s);
  return Number.isFinite(value) ? { value } : { error: `"${raw}" is not a number` };
}

/** "93.5%", "93,5", "0.935" → 0.935. A bare number above 1 is read as a percentage. */
export function parsePercent(raw) {
  const hadPercent = String(raw ?? "").includes("%");
  const parsed = parseNumber(String(raw ?? "").replace("%", ""));
  if (parsed.error || parsed.value == null) return parsed;
  const value = hadPercent || parsed.value > 1 ? parsed.value / 100 : parsed.value;
  if (value < 0 || value > 1) return { error: `"${raw}" is not a percentage between 0 and 100` };
  return { value };
}

function detectColumns(cells, source) {
  const headers = cells.map(normalizeHeader);
  const columns = {};
  const find = (names) => headers.findIndex((h) => names.includes(h));
  // The quarterly sheet heads its name column "Agent: Q3 2026", or just "Q2 2026" on the
  // previous-quarter block.
  const nameIndex = headers.findIndex(
    (h) => NAME_HEADERS.includes(h) || h.startsWith("agent:") || /^q[1-4] \d{4}$/.test(h),
  );
  if (nameIndex === -1) return null;
  columns.name = nameIndex;
  for (const field of SOURCES[source].fields) {
    const names = field === "count" ? COUNT_HEADERS[source] : HEADERS[field];
    const index = find(names);
    if (index !== -1) columns[field] = index;
  }
  const email = find(HEADERS.email);
  if (email !== -1) columns.email = email;
  return columns;
}

function positionalColumns(source) {
  return Object.fromEntries(SOURCES[source].positional.map((field, index) => [field, index]));
}

/**
 * Returns { headerLine, header, columns, rows, skipped, errors }:
 *   rows    — [{ line, rawName, email, values, errors }]; a row with errors is shown but
 *             can only be committed as skipped.
 *   skipped — lines dropped on purpose (blank placeholders, total rows), with the reason.
 *   errors  — problems with the paste as a whole.
 * `columns` overrides detection: { name: index, count: index, … }.
 */
export function parsePaste(text, source, columnsOverride = null) {
  const spec = SOURCES[source];
  if (!spec) return { rows: [], skipped: [], errors: [`unknown source "${source}"`] };
  const all = splitRows(text);
  if (!all.length) return { rows: [], skipped: [], errors: ["nothing to import"] };

  let headerLine = null;
  let header = null;
  let columns = columnsOverride;
  let body = all;
  if (!columns) {
    for (let i = 0; i < Math.min(all.length, 5); i++) {
      const detected = detectColumns(all[i].cells, source);
      if (detected) {
        columns = detected;
        headerLine = all[i].line;
        header = all[i].cells;
        body = all.slice(i + 1);
        break;
      }
    }
  }
  if (!columns) columns = positionalColumns(source);

  const errors = [];
  if (columns.name == null) errors.push("no agent name column");
  const valueFields = spec.fields.filter((f) => columns[f] != null);
  if (source === "hours") {
    if (!valueFields.length) errors.push("no chat hours or ticket hours column");
  } else if (columns.count == null) {
    errors.push("no count column (solved / served)");
  }
  if (errors.length) return { headerLine, header, columns, rows: [], skipped: [], errors };

  const rows = [];
  const skipped = [];
  const seen = new Map();
  for (const { line, cells } of body) {
    const rawName = String(cells[columns.name] ?? "").trim();
    if (EMPTY.test(rawName)) {
      skipped.push({ line, reason: "no agent name" });
      continue;
    }
    if (SUMMARY_ROW.test(rawName)) {
      skipped.push({ line, reason: "summary row" });
      continue;
    }
    // Sheets keep a row for everyone on the roster; a row with nothing but blanks and
    // zeros (no tickets, "0" surveys) has nothing to import.
    if (
      valueFields.every((f) => {
        const raw = String(cells[columns[f]] ?? "").trim();
        return EMPTY.test(raw) || parseNumber(raw.replace("%", "")).value === 0;
      })
    ) {
      skipped.push({ line, reason: "no values", rawName });
      continue;
    }

    const rowErrors = [];
    const values = {};
    for (const field of valueFields) {
      const raw = cells[columns[field]];
      const parsed = field === "csat" ? parsePercent(raw) : parseNumber(raw);
      if (parsed.error) {
        rowErrors.push(`${field}: ${parsed.error}`);
        continue;
      }
      values[field] = parsed.value;
      const mustBeWhole = ["count", "surveys", "good", "bad"].includes(field);
      if (parsed.value != null && parsed.value < 0) {
        rowErrors.push(`${field}: "${raw}" is negative`);
      } else if (parsed.value != null && mustBeWhole && !Number.isInteger(parsed.value)) {
        rowErrors.push(`${field}: "${raw}" must be a whole number`);
      }
    }
    if (source !== "hours" && values.count == null) rowErrors.push("count is empty");
    // A CSAT with no surveys behind it is noise from the export, not a rating.
    if (values.surveys === 0) values.csat = null;

    const key = normalizeName(rawName);
    if (seen.has(key)) rowErrors.push(`duplicate of line ${seen.get(key)}`);
    else seen.set(key, line);

    rows.push({
      line,
      rawName,
      email: columns.email != null ? String(cells[columns.email] ?? "").trim() || null : null,
      values,
      errors: [...new Set(rowErrors)],
    });
  }
  return { headerLine, header, columns, rows, skipped, errors };
}
