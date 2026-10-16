/**
 * Helpers for testing Zendesk query builders. Not imported by any production code.
 *
 * The property tests ask one question of a builder: whatever a value contains, does the query
 * still read as exactly the conditions the builder meant to write? "Reads as" is the
 * difficulty — we do not know how Zendesk tokenizes Unicode — so the answer is checked under
 * two readings, a lenient one and a deliberately strict one (NFKC-folded, quote lookalikes
 * treated as quotes, every Unicode separator a break). Every unusual character is built from
 * its code point, so this file holds none of them raw.
 */

export const cp = (...codes) => String.fromCodePoint(...codes);

/** Split a query into top-level tokens, the way Zendesk reads it: spaces inside quotes do not split. */
export function tokenize(query) {
  const tokens = [];
  let current = "";
  let quoted = false;
  for (const char of query) {
    if (char === '"') quoted = !quoted;
    if (char === " " && !quoted) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (quoted) throw new Error(`unbalanced quotes in: ${query}`);
  if (current) tokens.push(current);
  return tokens;
}

/** Characters a stricter reader could take for a double quote. */
const QUOTE_LOOKALIKES = new Set(
  [0x201c, 0x201d, 0x201e, 0x201f, 0xff02, 0xab, 0xbb, 0x2033, 0x301d, 0x301e, 0x275d, 0x275e].map((code) => String.fromCodePoint(code)),
);

const SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * A harsher reading than `tokenize`: fold the text to NFKC, work in grapheme clusters (so a
 * quote with a combining mark fused to it is no longer a quote, as it is not to a reader that
 * works in clusters), treat quote lookalikes as quotes, and break on any Unicode whitespace,
 * separator or control character outside quotes.
 */
export function strictTokenize(query) {
  const tokens = [];
  let current = "";
  let quoted = false;
  for (const { segment } of SEGMENTER.segment(query.normalize("NFKC"))) {
    if (segment === '"' || QUOTE_LOOKALIKES.has(segment)) {
      quoted = !quoted;
      current += '"';
      continue;
    }
    const separator = [...segment].every((char) => /\s/u.test(char) || char === cp(0x85) || /\p{Z}/u.test(char) || /\p{Cc}/u.test(char));
    if (!quoted && separator) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += segment;
    }
  }
  if (current) tokens.push(current);
  return { tokens, balanced: !quoted };
}
/** What an accepted query may contain: no control or separator character other than a plain space. */
export const NO_SLIPPERY = /[\p{C}\p{Zl}\p{Zp}]|[^\S ]|\p{Zs}(?<! )/u;

/** A small deterministic generator, so a failure can be reproduced. */
export function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export const HOSTILE = [
  ...'"\\ :-*<>=()[]{}|&;,#%+@._\n\r\t\'',
  ..."abcXYZ0189",
  " status:solved", " OR ", " -tags:", " type:user", ' " ', "organization:", "role:admin ", "created>2000-01-01", " is_suspended:false ",
  // Lookalikes and separators a stricter reader might fold or break on.
  cp(0), cp(0x1f), cp(0x7f), cp(0x85), cp(0xa0), cp(0xad), cp(0x2028), cp(0x2029), cp(0x3000), cp(0x2003),
  cp(0x201c), cp(0x201d), cp(0x201e), cp(0xff02), cp(0xab), cp(0xbb), cp(0x2033), cp(0x301d),
  cp(0xff1a), cp(0xff0d), cp(0x2010), cp(0x2011), cp(0x2212), cp(0xfe63), cp(0xff0a),
  cp(0x200b), cp(0x200d), cp(0x202e), cp(0x2066), cp(0xfeff), cp(0xfdfa), cp(0xfb01), cp(0x2460), cp(0xff21),
  cp(0xe9), cp(0x3b1), cp(0x4e2d), cp(0x1f600),
  // Marks, selectors, fillers, Tag characters and controls: the classes the allowlist must still handle.
  cp(0x301), cp(0x34f), cp(0x115f), cp(0x1160), cp(0x180b), cp(0x200c), cp(0x2060), cp(0x3164), cp(0xfe0f), cp(0xffa0),
  cp(0xe0041), cp(0xe0100), cp(0x1b), cp(0x9b), cp(0xe000),
];

export function hostileString(random) {
  const length = 1 + Math.floor(random() * 25);
  return Array.from({ length }, () => HOSTILE[Math.floor(random() * HOSTILE.length)]).join("");
}

/**
 * A short run of hostile characters set into otherwise acceptable text, so a good share of the
 * strings are *accepted* and the property under test (an accepted value adds nothing) is
 * exercised, not just the refusals. Pure `hostileString`s are almost all refused by an allowlist.
 */
export function mixedString(random) {
  const run = Array.from({ length: 1 + Math.floor(random() * 3) }, () => HOSTILE[Math.floor(random() * HOSTILE.length)]).join("");
  switch (Math.floor(random() * 4)) {
    case 0:
      return `word ${run}`;
    case 1:
      return `${run} word`;
    case 2:
      return `word${run}word`;
    default:
      return `Acme ${run} Ltd`;
  }
}

/** Alternate the two, so both the wholly hostile and the nearly acceptable are tried. */
export function sample(random, i) {
  return i % 2 === 0 ? hostileString(random) : mixedString(random);
}
export default { cp, tokenize, strictTokenize, NO_SLIPPERY, generator, HOSTILE, hostileString, mixedString, sample };
