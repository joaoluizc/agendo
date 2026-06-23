const getLocalTimeframeISOld = (date: string | number | Date) => {

    // Get today's date in local time
    const today = new Date(date);

    // Calculate the start and end of the day in local time
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Convert the start and end of the day to UTC
    const startOfDayUTC = new Date(startOfDay.getTime() - (startOfDay.getTimezoneOffset() * 60000));
    const endOfDayUTC = new Date(endOfDay.getTime() - (endOfDay.getTimezoneOffset() * 60000));

    // Convert to ISO string
    const startOfDayISO = startOfDayUTC.toISOString();
    const endOfDayISO = endOfDayUTC.toISOString();
    
    const todayISO = `${startOfDayISO}/${endOfDayISO}`;
    
    return {todayISO, startOfDayISO, endOfDayISO};
}

const getLocalTimeframeISO = (date: string | number | Date) => {
  
    // Get the provided date in local time
    const today = new Date(date);
  
    // Calculate the start and end of the day in local time
    const startOfDay = new Date(today);
    // startOfDay.setDate(today.getDate() - 1); // Set to one day before
    startOfDay.setHours(0, 0, 0, 0);
  
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 0);
  
    // Convert to ISO string
    const startOfDayISO = startOfDay.toISOString();
    const endOfDayISO = endOfDay.toISOString();
    
    const todayISO = `${startOfDayISO}/${endOfDayISO}`;
    
    return { todayISO, startOfDayISO, endOfDayISO };
  };

/** Formats a Date as a local `YYYY-MM-DD` string, suitable for a URL param.
 * Uses local calendar parts (not UTC) so the day matches what the user sees.
 */
export const formatDateParam = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

/** Parses a local `YYYY-MM-DD` string into a Date at local midnight.
 * Returns null when the value is missing or not a valid calendar date, so
 * callers can fall back to a default (e.g. today).
 */
export const parseDateParam = (value: string | null | undefined): Date | null => {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    // Reject overflowed dates like 2026-02-31 (JS would roll them over).
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }
    return date;
};

export default {
    getLocalTimeframeISO,
    getLocalTimeframeISOld,
};