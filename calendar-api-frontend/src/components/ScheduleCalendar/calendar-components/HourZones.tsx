import type React from "react";
/**
 * What one of the ruler's hours is for each region the team works from.
 *
 * The ruler is drawn in the *viewer's* local time, which is the right default — you
 * schedule against your own clock. The cost is that a Brazilian lead reading 14:00 has to
 * work out what that means for someone in Manila before deciding whether it is a sane
 * hour to put them on. This answers that without leaving the grid.
 */

import type { Clock } from "@/utils/timeFormat";
import {
  BrazilFlag,
  IsraelFlag,
  PhilippinesFlag,
  UnitedStatesFlag,
} from "./LocationFlags";

/**
 * IANA zones, one per location button, in the same order as the flags so the two rows of
 * the toolbar tell a consistent story.
 *
 * Louisville CO rather than "US": Colorado is Mountain Time, and picking the office's
 * actual town keeps the zone right through daylight-saving changes the abbreviations
 * would get wrong. Same reason Florianópolis resolves to America/Sao_Paulo — Brazil has
 * had more than one national rule, and the zone database tracks that; a fixed UTC offset
 * would silently drift.
 */
export const ZONES = [
  { label: "Colorado", zone: "America/Denver", Flag: UnitedStatesFlag },
  { label: "LATAM", zone: "America/Sao_Paulo", Flag: BrazilFlag },
  { label: "Israel", zone: "Asia/Jerusalem", Flag: IsraelFlag },
  { label: "APAC", zone: "Asia/Manila", Flag: PhilippinesFlag },
] as const;

export type ZoneReading = {
  label: string;
  Flag: (props: { className?: string }) => React.ReactElement;
  /**
   * Always with minutes (`14:30` / `2:30 PM`) — a shift can start at 15, 30 or 45 past, and
   * half-hour zones exist.
   */
  time: string;
  /** `+1` when that zone is already on the next day, `-1` when still on the previous. */
  dayShift: number;
};

const dayNumber = (date: Date, zone: string) =>
  Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(date)
      .replace(/-/g, "")
  );

/**
 * The zone's hour and minute as numbers, written by `clock` like every other time.
 *
 * `h23` rather than `hour12: false`: some engines map the latter to `h24` and read midnight
 * as `24:00`.
 */
const clockIn = (instant: Date, zone: string, clock: Clock) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: "hour" | "minute") =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  return clock.hm(part("hour"), part("minute"));
};

/**
 * Read `instant` in each region.
 *
 * The day shift is computed by comparing calendar dates in each zone rather than by
 * dividing offsets, because an offset difference of a few hours can still land on the
 * same date or two days apart depending on the hour — and half-hour zones exist. Both
 * sides are formatted as YYYYMMDD and subtracted, which is exact for the ±1 day this can
 * ever produce.
 */
export const readZones = (instant: Date, clock: Clock): ZoneReading[] => {
  const localDay = dayNumber(instant, Intl.DateTimeFormat().resolvedOptions().timeZone);

  return ZONES.map(({ label, zone, Flag }) => ({
    label,
    Flag,
    time: clockIn(instant, zone, clock),
    // Dates are adjacent by construction — one instant cannot be two days apart across
    // inhabited zones — so a plain difference of the YYYYMMDD numbers is not meaningful,
    // but its sign is.
    dayShift: Math.sign(dayNumber(instant, zone) - localDay),
  }));
};
