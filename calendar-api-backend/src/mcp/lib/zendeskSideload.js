import { fitPage, jsonLine } from "./zendeskShape.js";

/**
 * Loading the people or organizations behind a page of ids, once each, for an answer.
 *
 * A ticket shows `requester_id: 2001`, which means nothing to a reader. `include` asks for the
 * records behind the ids, fetched with Zendesk's `show_many` (a hundred ids a request) and shown
 * next to the tickets, each at most once. Three rules, each from a way this goes wrong:
 *
 *  - **A budget of its own.** Two hundred long names must not swell an answer; the section is
 *    cut to `maxChars`, and says how many were left out.
 *  - **Missing ids are counted.** `show_many` silently omits a deleted record or one the shared
 *    user cannot see; an answer that says nothing reads as if everyone was found.
 *  - **A failed lookup does not throw the answer away.** The tickets are the answer. A Zendesk
 *    refusal becomes a note in the tool's own words — the error's log-safe text, never the
 *    detail Zendesk sent back — but a cancellation or a bug in agendo is rethrown.
 */

/** `show_many` takes at most this many ids. */
export const SHOW_MANY_LIMIT = 100;

/** Records by id, a hundred at a time. */
export async function loadMany(zd, path, key, ids, options) {
  const found = [];
  for (let start = 0; start < ids.length; start += SHOW_MANY_LIMIT) {
    const chunk = ids.slice(start, start + SHOW_MANY_LIMIT);
    const body = await zd.get(path, { ids: chunk.join(",") }, options);
    if (Array.isArray(body?.[key])) found.push(...body[key]);
  }
  return found;
}

/**
 * `{ lines, notes }` for one kind of record: `lines` are JSON lines for inside the fence, or
 * null when the lookup failed (the section is then left out); `notes` are the tool's own words
 * for outside it.
 *
 * @param {{ zd, options, signal, label: string, path: string, key: string, ids: number[],
 *   toRecord: (row: object) => object, maxChars: number }} lookup
 */
export async function sideload({ zd, options, signal, label, path, key, ids, toRecord, maxChars }) {
  if (!ids.length) return { lines: [], notes: [] };
  try {
    const rows = await loadMany(zd, path, key, ids, options);
    const found = new Set(rows.map((row) => row?.id));
    const missing = ids.filter((wanted) => !found.has(wanted)).length;
    const fit = fitPage({ blocks: rows.map((row) => jsonLine(toRecord(row))), maxChars });
    const notes = [];
    if (fit.omitted) {
      notes.push(`${fit.omitted} more ${label} did not fit and are not shown; ask for fewer tickets or a smaller page_size.`);
    }
    if (missing) {
      notes.push(
        `${missing} of the ${ids.length} ${label} could not be found (deleted, or not visible to the shared Zendesk user); ` +
          `their ids are still on the tickets.`,
      );
    }
    return { lines: fit.kept, notes };
  } catch (error) {
    // The tickets are the answer; a failed lookup should not throw them away.
    if (signal?.aborted || error?.name !== "ZendeskError") throw error;
    // The tool's own words: the error's log-safe text, never the detail Zendesk echoed.
    return { lines: null, notes: [`Could not load the ${label} (${error.logMessage}); the ids are still on the tickets.`] };
  }
}

export default { sideload, loadMany, SHOW_MANY_LIMIT };
