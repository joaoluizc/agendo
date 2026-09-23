import { useSyncExternalStore } from "react";

/**
 * How clock times are written across the app: 24-hour or 12-hour (AM/PM).
 *
 * "auto" follows the browser, via `Intl.DateTimeFormat().resolvedOptions().hourCycle`.
 * That is only as good as what the browser exposes: Chrome and Edge derive it from the
 * browser's *language* (en-US -> AM/PM, en-GB or pt-BR -> 24h), not from the operating
 * system's 12/24-hour switch, while Safari and Firefox can follow OS regional settings.
 * So "auto" is right for most people but not guaranteed — hence the explicit override, in
 * the header's theme menu (the sun/moon button with the clock on it).
 *
 * Kept per browser in localStorage: it is a personal display preference, nothing another
 * viewer needs to see.
 *
 * Times are written by hand rather than through `toLocaleTimeString`, so the result is the
 * same in every browser. ICU 72 started separating the AM/PM with a narrow no-break space
 * (U+202F) in some engines and not others, which silently broke the string surgery the old
 * formatters did on "10:00 AM".
 */
export type TimeFormatPreference = "auto" | "24h" | "12h";

const STORAGE_KEY = "agendo.timeFormat";

/** True when the browser's own locale writes times with AM/PM. */
export const detectBrowserHour12 = (): boolean => {
  try {
    // The ES2020 typings this project builds against predate the resolved `hourCycle`,
    // though every supported browser reports it.
    const { hourCycle, hour12 }: Intl.ResolvedDateTimeFormatOptions & {
      hourCycle?: string;
    } = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
    if (hourCycle) return hourCycle === "h11" || hourCycle === "h12";
    return Boolean(hour12);
  } catch {
    return false;
  }
};

const readStored = (): TimeFormatPreference => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "24h" || value === "12h" ? value : "auto";
  } catch {
    return "auto";
  }
};

let preference: TimeFormatPreference = readStored();
const listeners = new Set<() => void>();

const setPreference = (next: TimeFormatPreference) => {
  preference = next;
  try {
    if (next === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private windows and blocked storage: the choice still applies for this session.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getPreference = () => preference;

const pad = (value: number) => String(value).padStart(2, "0");

/** 13 -> 1; 0, 12 and 24 -> 12. */
const onDial = (h: number) => (h % 12 === 0 ? 12 : h % 12);

/** 24 — the end of a day — is midnight again, so it is AM like 0 is. */
const halfOf = (h: number) => (h % 24 < 12 ? "AM" : "PM");

type ClockParts = [hours: number, minutes: number];

/** An instant's local hours and minutes. */
const partsOf = (date: Date | string): ClockParts => {
  const d = new Date(date);
  return [d.getHours(), d.getMinutes()];
};

/**
 * Fractional hours on the selected day (`9.5` -> 9:30).
 *
 * Hour 24 stays 24 rather than wrapping to 0 — a range ending at midnight must not read as
 * ending before it started — and past 24 it wraps, because an overnight end is a real
 * next-day clock time (`21:00–01:00` is how people write it, `21:00–25:00` is not). Which
 * day the end falls on is the caller's label to carry, not the number's.
 */
const partsOfHour = (value: number): ClockParts => {
  const onClock = value > 24 ? value - 24 : value;
  const whole = Math.floor(onClock);
  return [whole, Math.round((onClock - whole) * 60)];
};

/** Formatters bound to one resolved format. Pure, so they can be passed into utilities. */
export type Clock = ReturnType<typeof makeClock>;

export const makeClock = (hour12: boolean) => {
  /** Hours and minutes as the chosen format writes them, always with the minutes. */
  const hm = (h: number, m: number) =>
    hour12 ? `${onDial(h)}:${pad(m)} ${halfOf(h)}` : `${pad(h)}:${pad(m)}`;

  /**
   * `hm`, minus a whole hour's `:00` in 12-hour form (`9 AM`) — the style shift blocks have
   * always used. 24-hour form keeps it (`14:00`; a bare `14` reads as a count), unless
   * `tight` asks for the bare hour where width is scarcer than clarity.
   */
  const short = ([h, m]: ClockParts, tight: boolean) => {
    if (m !== 0) return hm(h, m);
    if (hour12) return `${onDial(h)} ${halfOf(h)}`;
    return tight ? pad(h) : hm(h, m);
  };

  /**
   * Two times as one span, writing a shared AM/PM once (`9–11:30 AM`). Only when the span
   * does not wrap past midnight: `9–1 AM` would read as running backwards.
   */
  const span = (from: ClockParts, to: ClockParts, tight = false) => {
    const start = short(from, tight);
    const end = short(to, tight);
    if (!hour12) return `${start}–${end}`;
    const sharesHalf =
      halfOf(from[0]) === halfOf(to[0]) &&
      from[0] * 60 + from[1] <= to[0] * 60 + to[1];
    return sharesHalf ? `${start.slice(0, -3)}–${end}` : `${start} – ${end}`;
  };

  /** A moment on the clock, e.g. the now-line or a "created at": `14:05` / `2:05 PM`. */
  const time = (date: Date | string) => hm(...partsOf(date));

  return {
    hour12,
    /** For the few places still formatted by `toLocaleString` (browser-locale dates). */
    hourCycle: (hour12 ? "h12" : "h23") as Intl.DateTimeFormatOptions["hourCycle"],
    hm,
    time,

    /** Fractional hours on the selected day, always with minutes: `09:30` / `9:30 AM`. */
    hour: (value: number) => hm(...partsOfHour(value)),

    /**
     * A range in fractional hours, for the dialogs: `09:00–11:30` / `9–11:30 AM`. Written
     * exactly as `range` writes the same two instants, so a dialog and the block it
     * previews read the same. `tight` drops a whole hour's `:00` in 24-hour form too
     * (`13–14:30`), for badges.
     */
    hourRange: (
      range: { start: number; end: number },
      { tight = false }: { tight?: boolean } = {}
    ) => span(partsOfHour(range.start), partsOfHour(range.end), tight),

    /** The grid header and strip ticks: `09` / `9 AM`. */
    headerHour: (h: number) => (hour12 ? `${onDial(h)} ${halfOf(h)}` : pad(h)),

    /**
     * Two instants as a range: `09:00–11:30` / `9–11:30 AM` / `9 AM – 5 PM`.
     *
     * An end at exactly midnight after its start closes that day, so it is written `24:00`
     * — the same rule `hour` applies to hour 24, so `22:00–24:00` on a block matches its
     * dialog. In 12-hour form midnight is `12 AM`, which already reads as the day's end.
     */
    range: (start: Date | string, end: Date | string) => {
      const to = partsOf(end);
      const closesDay =
        to[0] === 0 && to[1] === 0 && new Date(end) > new Date(start);
      return span(partsOf(start), closesDay ? [24, 0] : to);
    },

    /** A date plus its time: `Thu, Sep 24, 1:00 AM` / `Thu, Sep 24, 01:00`. */
    dateTime: (date: Date | string, options: Intl.DateTimeFormatOptions) =>
      `${new Date(date).toLocaleDateString("en-US", options)}, ${time(date)}`,

    /** A Google event's span with its date: `Thu, Sep 30, 10:00 AM to 12:00 PM`. */
    eventRange: (start: string, end: string) =>
      `${new Date(start).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })}, ${time(start)} to ${time(end)}`,
  };
};

/**
 * What "auto" means on this page load. The default locale behind `Intl` is fixed for a
 * running page, and resolving it costs an `Intl.DateTimeFormat` — too much to pay in every
 * one of the grid's ~500 subscribers on every render.
 */
const browserHour12 = detectBrowserHour12();

/** One instance per format, so every component holds the same object for the same format. */
const CLOCK_12H = makeClock(true);
const CLOCK_24H = makeClock(false);

/**
 * The current time format, and a way to change it. Any component that writes a clock time
 * should read its formatters from here, so switching the format re-renders it.
 */
export const useTimeFormat = () => {
  const current = useSyncExternalStore(subscribe, getPreference);
  const hour12 = current === "auto" ? browserHour12 : current === "12h";
  return {
    preference: current,
    setPreference,
    hour12,
    browserHour12,
    clock: hour12 ? CLOCK_12H : CLOCK_24H,
  };
};
