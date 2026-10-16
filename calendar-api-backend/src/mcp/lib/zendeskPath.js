/**
 * Zendesk paths with an id in them, built so the id can only be an id.
 *
 * A tool that fetches `/api/v2/tickets/{id}.json` must never build that path by gluing a
 * model-supplied string into it: a value such as `123/../../users` or `1%2f..` is exactly how
 * a read of one ticket becomes a read of something else. The client's own allowlist is a
 * backstop that checks characters, not meaning. This is the front door: a tagged template
 * that accepts a positive whole number (or a string of digits that is one) in every `${}`
 * slot and refuses anything else, so a path can only ever be a fixed template with ids in
 * it.
 *
 *     zendeskPath`/api/v2/tickets/${ticketId}/comments.json`
 *
 * The error names no value: it may have come from a model that copied something hostile.
 */

/** An error about a path argument. Its message holds no value, so it is log-safe. */
export class ZendeskPathError extends Error {
  constructor(message) {
    super(message);
    this.name = "ZendeskPathError";
    this.logMessage = message;
  }
}

/** A Zendesk id from a number or a string of digits, or null if it is neither. */
export function asId(raw) {
  const candidate = typeof raw === "string" && /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : raw;
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null;
}

export function zendeskPath(strings, ...ids) {
  let path = strings[0];
  ids.forEach((raw, index) => {
    const id = asId(raw);
    if (id === null) {
      throw new ZendeskPathError(`argument ${index + 1} of this Zendesk request is not a positive whole-number id`);
    }
    path += `${id}${strings[index + 1]}`;
  });
  return path;
}

export default { zendeskPath, asId, ZendeskPathError };
