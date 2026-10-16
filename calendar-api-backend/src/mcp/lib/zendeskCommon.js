/**
 * What every Zendesk tool does the same way, in one place so they cannot do it differently.
 *
 * - **One deadline per tool call**, shared by every Zendesk request the call makes, plus the
 *   caller's cancel signal: `toolOptions(extra)` is what each request is given.
 * - **Cursors are opaque values, never URLs.** Zendesk hands one back (`meta.after_cursor`)
 *   and the next call passes it back as `page[after]`. Both directions are checked against
 *   the same shape, so a model cannot slip anything else through that parameter, and Zendesk's
 *   own cursor is not echoed to a model unless it looks like one.
 */

/** One deadline over every Zendesk request a tool makes for one answer. */
export const TOOL_DEADLINE_MS = 25_000;

/** Zendesk's cursors are opaque base64-ish strings; anything else is not one of theirs. */
export const CURSOR = /^[A-Za-z0-9+/=_.-]{1,512}$/;

/** The options each request of one tool call is given: the cancel signal and a shared deadline. */
export function toolOptions(extra) {
  return { signal: extra?.signal, deadlineAt: Date.now() + TOOL_DEADLINE_MS };
}

/** `{ hasMore, cursor }` from a Zendesk page's `meta`; the cursor is null unless it is well-formed. */
export function pageInfo(meta) {
  const hasMore = meta?.has_more === true;
  const cursor =
    hasMore && typeof meta?.after_cursor === "string" && CURSOR.test(meta.after_cursor) ? meta.after_cursor : null;
  return { hasMore, cursor };
}

/** What a tool says about the next page: nothing when it is the last, the cursor when it can. */
export function paging({ hasMore, cut, nextCursor, noun }) {
  if (!hasMore) return cut ? [] : ["That is the last page."]; // "last page" is only true if nothing was cut
  if (nextCursor) {
    return [
      `More ${noun} exist. For the next page call this tool again with the same filters and ` +
        `after_cursor: ${JSON.stringify(nextCursor)} (it expires after an hour).`,
    ];
  }
  return cut ? [] : [`Zendesk reported more ${noun} but gave no usable cursor to continue with.`];
}

export default { TOOL_DEADLINE_MS, CURSOR, toolOptions, pageInfo, paging };
