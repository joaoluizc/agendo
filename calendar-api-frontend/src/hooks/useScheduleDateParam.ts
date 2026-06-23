import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateParam, parseDateParam } from "@/utils/utils";

export const DATE_SEARCH_PARAM = "date";

/** Today at local midnight, so it round-trips cleanly through the URL param. */
const localToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * Keeps the schedule's selected day in a `?date=YYYY-MM-DD` URL param so a
 * refresh (or a shared link) reopens the same day instead of snapping back to
 * today. Used by both the agendo and Sling schedule screens.
 *
 * Behaviour:
 * - First load with no/invalid param → today's date is written with `replace`
 *   (no extra history entry), satisfying "add today's param on first load".
 * - `selectedDate` is always a valid Date (falls back to today).
 * - `dateKey` is the canonical `YYYY-MM-DD` string — use it as the dependency
 *   for data-fetching effects so each day is fetched exactly once.
 * - `setDate` pushes a new history entry so day-to-day browsing is undoable.
 */
export const useScheduleDateParam = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawDate = searchParams.get(DATE_SEARCH_PARAM);

  const selectedDate = useMemo(
    () => parseDateParam(rawDate) ?? localToday(),
    [rawDate]
  );
  const dateKey = formatDateParam(selectedDate);

  const setDate = useCallback(
    (date: Date, options?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(DATE_SEARCH_PARAM, formatDateParam(date));
          return next;
        },
        { replace: options?.replace ?? false }
      );
    },
    [setSearchParams]
  );

  // On first load (or a malformed param) pin today's date into the URL.
  useEffect(() => {
    if (!parseDateParam(rawDate)) {
      setDate(localToday(), { replace: true });
    }
  }, [rawDate, setDate]);

  return { selectedDate, dateKey, setDate };
};
