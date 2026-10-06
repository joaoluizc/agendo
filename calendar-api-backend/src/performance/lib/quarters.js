/**
 * Quarters as explicit instants. The server runs in UTC and the team in UTC-3 (Brazil
 * has had no DST since 2019), so a quarter starts at 03:00Z on its first day. Never build
 * these from server-local date parts (see docs/knowledge on the UTC/UTC-3 split).
 */

export const TEAM_TZ = "America/Sao_Paulo";
export const TEAM_UTC_OFFSET_MINUTES = -180;

const KEY_PATTERN = /^(\d{4})-Q([1-4])$/;

export function periodKey(year, quarter) {
  return `${year}-Q${quarter}`;
}

export function parsePeriodKey(key) {
  const match = KEY_PATTERN.exec(String(key || ""));
  if (!match) return null;
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

export function periodLabel(year, quarter) {
  return `Q${quarter} ${year}`;
}

/** { startsAt, endsAt } with endsAt exclusive. Date.UTC rolls month 12 into next year. */
export function quarterBounds(year, quarter, offsetMinutes = TEAM_UTC_OFFSET_MINUTES) {
  const startMonth = 3 * (quarter - 1);
  const shift = -offsetMinutes * 60000;
  return {
    startsAt: new Date(Date.UTC(year, startMonth, 1) + shift),
    endsAt: new Date(Date.UTC(year, startMonth + 3, 1) + shift),
  };
}

export function previousQuarter(year, quarter) {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 };
}
