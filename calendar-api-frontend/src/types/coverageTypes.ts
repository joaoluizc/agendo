/** A named, colored group of positions with an hourly headcount target per weekday.
 *
 * The schedule page renders one coverage row per meter and flags any half hour where
 * fewer agents are scheduled than the target asks for. Admin-only, end to end.
 *
 * `positionIds` are `Position._id` values — the same id space as `Shift.positionId`,
 * not the Sling id in `Position.positionId`.
 *
 * `targets[d][s]` is **UTC**, Sunday-first: `d` is `Date#getUTCDay()`, `s` is a
 * half-hour slot 0..47. Agendo is used across timezones, so a target is stored as an
 * absolute weekly instant rather than a wall-clock label; clients convert to their
 * own local time for display. See `src/utils/coverageTargets.ts` — including why the
 * slots are half-hourly even though the settings grid is hourly.
 */
export type CoverageMeter = {
  _id: string;
  name: string;
  color: string;
  positionIds: string[];
  targets: number[][];
  order?: number;
};
