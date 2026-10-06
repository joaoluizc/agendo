import userService from "../../services/userService.js";
import positionService from "../../services/positionService.js";
import locationService from "../../services/locationService.js";

/**
 * Names for ids, so no tool ever hands an id to a model.
 *
 * Three id spaces meet in a shift, and confusing them is the recurring failure in this
 * codebase:
 *
 *  - `Shift.userId` is a **Clerk** id (`user_…`), joining `User.clerkId`.
 *  - `Shift.positionId` is a **Mongo** `Position._id`. So is
 *    `CoverageMeter.positionIds`, which is why coverage is a direct join.
 *  - `Position.positionId` is a **Sling** id, a different space entirely, used by
 *    `User.positionsToSync[].positionId`. Nothing here touches it.
 *
 * Resolving centrally means a tool handler never sees an id it could mix up, and a
 * model never sees one it could repeat at a user.
 */

/**
 * Load the roster and position catalogue once for a request.
 *
 * Two Mongo reads serve every tool in a call. `userService.getAllUsersSafeInfo` is
 * deliberately *not* used: it reaches out to Clerk for avatars, which is a network
 * round trip for data no tool renders.
 */
export async function loadRoster() {
  const [users, positions, locations] = await Promise.all([
    userService.findAllUsers(),
    positionService.getPositions(),
    // `Location.assignedUsers` holds Clerk ids, the same space as `Shift.userId`, so a
    // location filter narrows to people by a direct lookup rather than another join.
    locationService.getAllLocations().catch(() => []),
  ]);

  const usersByClerkId = new Map();
  for (const user of users) {
    if (user.clerkId) usersByClerkId.set(user.clerkId, user);
  }

  const positionsById = new Map();
  for (const position of positions) {
    positionsById.set(String(position._id), position);
  }

  return { users, usersByClerkId, positions, positionsById, locations };
}

/** `João Coelho`, falling back to the email, then to the raw id. */
export function userDisplayName(user) {
  if (!user) return null;
  // Each part trimmed, not just the whole: the roster has values with trailing
  // whitespace ("Aiman "), which would otherwise render as a double space.
  const name = [user.firstName, user.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return name || user.email || null;
}

/**
 * A name for a `Shift.userId`.
 *
 * The shifts collection holds seeded test rows (`test_riley`, `test_bia`, …) alongside
 * real ones — 18 of 36 distinct ids at the last audit — and it is *not* split by
 * environment, so production reads see them. Labelling them plainly beats dropping
 * them: a schedule quietly missing rows is indistinguishable from a quiet day.
 */
export function resolveUserLabel(clerkId, usersByClerkId) {
  const user = usersByClerkId.get(clerkId);
  if (user) return userDisplayName(user);
  return `unknown agent (${clerkId})`;
}

/** A name for a `Shift.positionId`. */
export function resolvePositionName(positionId, positionsById) {
  const position = positionsById.get(String(positionId));
  return position?.name || `unknown position (${positionId})`;
}

/**
 * Find roster members by a loosely-typed name.
 *
 * Matches first name, last name, full name and the email's local part, case- and
 * accent-insensitively, so "joao" finds "João". Returns **every** match rather than a
 * best guess: handing back the wrong colleague's schedule because two people share a
 * first name is exactly the kind of confident error worth refusing to make. The caller
 * decides what to do with 0, 1 or several.
 */
export function findUsersByName(query, users) {
  const needle = normalise(query);
  if (!needle) return [];

  const scored = [];
  for (const user of users) {
    const first = normalise(user.firstName);
    const last = normalise(user.lastName);
    const full = `${first} ${last}`.trim();
    const local = normalise(String(user.email || "").split("@")[0]);

    // Exact beats prefix beats contained, so "ana" prefers Ana over Joana.
    let rank = null;
    if (full === needle || first === needle || last === needle) rank = 0;
    else if (
      full.startsWith(needle) ||
      first.startsWith(needle) ||
      last.startsWith(needle)
    )
      rank = 1;
    else if (full.includes(needle) || local.includes(needle)) rank = 2;

    if (rank !== null) scored.push({ user, rank });
  }

  if (!scored.length) return [];

  // Only the strongest tier survives: a prefix hit should not be diluted by every
  // substring hit on the roster.
  const best = Math.min(...scored.map((s) => s.rank));
  return scored.filter((s) => s.rank === best).map((s) => s.user);
}

/**
 * Find positions by a loosely-typed name, with the same all-matches contract as
 * `findUsersByName`: scheduling someone onto the wrong position because two share a word
 * is exactly the confident error worth refusing to make.
 */
export function findPositionsByName(query, positions) {
  const needle = normalise(query);
  if (!needle) return [];

  const scored = [];
  for (const position of positions) {
    const name = normalise(position.name);
    let rank = null;
    if (name === needle) rank = 0;
    else if (name.startsWith(needle)) rank = 1;
    else if (name.includes(needle)) rank = 2;
    if (rank !== null) scored.push({ position, rank });
  }
  if (!scored.length) return [];
  const best = Math.min(...scored.map((s) => s.rank));
  return scored.filter((s) => s.rank === best).map((s) => s.position);
}

/** Find locations by a loosely-typed name, returning every match. */
export function findLocationsByName(query, locations) {
  const needle = normalise(query);
  if (!needle) return [];
  const scored = [];
  for (const location of locations) {
    const name = normalise(location.name);
    let rank = null;
    if (name === needle) rank = 0;
    else if (name.startsWith(needle)) rank = 1;
    else if (name.includes(needle)) rank = 2;
    if (rank !== null) scored.push({ location, rank });
  }
  if (!scored.length) return [];
  const best = Math.min(...scored.map((s) => s.rank));
  return scored.filter((s) => s.rank === best).map((s) => s.location);
}

/** Lowercase, strip accents, collapse whitespace. */
function normalise(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export default {
  loadRoster,
  findPositionsByName,
  findLocationsByName,
  userDisplayName,
  resolveUserLabel,
  resolvePositionName,
  findUsersByName,
};
