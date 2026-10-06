/**
 * Matching a pasted agent name to an agendo user. Exact matches (email, saved alias,
 * normalized full name) are applied automatically; anything fuzzier is only offered as a
 * suggestion for an admin to confirm, so a wrong person is never picked silently.
 */

/** Accents stripped, lowercased, punctuation dropped, whitespace collapsed. */
export function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

/**
 * Score how plausibly `raw` names `candidate` (both normalized), 0 when not at all.
 * Catches the usual export drift: a middle name present on one side only, a nickname
 * that starts the same way, a typo.
 */
export function similarity(raw, candidate) {
  if (!raw || !candidate) return 0;
  if (raw === candidate) return 1;
  const a = raw.split(" ");
  const b = candidate.split(" ");
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length >= 2 && shorter.every((t) => longer.includes(t))) return 0.9;
  const sameLast = a[a.length - 1] === b[b.length - 1];
  if (sameLast && (a[0].startsWith(b[0]) || b[0].startsWith(a[0]))) return 0.8;
  const distance = levenshtein(raw, candidate);
  if (distance <= 2) return 0.7 - distance * 0.05;
  return 0;
}

/**
 * users:   [{ clerkId, firstName, lastName, email }]
 * aliases: Map<normalized alias, clerkId>
 * Returns { clerkId, by: "email"|"alias"|"exact" } or { clerkId: null, candidates }.
 */
export function matchAgent({ rawName, email }, users, aliases) {
  if (email) {
    const wanted = String(email).trim().toLowerCase();
    const user = users.find((u) => String(u.email || "").toLowerCase() === wanted);
    if (user) return { clerkId: user.clerkId, by: "email" };
  }
  const normalized = normalizeName(rawName);
  if (aliases.has(normalized)) return { clerkId: aliases.get(normalized), by: "alias" };
  const fullNames = users.map((u) => ({
    clerkId: u.clerkId,
    name: `${u.firstName} ${u.lastName}`.trim(),
    normalized: normalizeName(`${u.firstName} ${u.lastName}`),
  }));
  const exact = fullNames.filter((u) => u.normalized === normalized);
  if (exact.length === 1) return { clerkId: exact[0].clerkId, by: "exact" };
  const candidates = fullNames
    .map((u) => ({ clerkId: u.clerkId, name: u.name, score: similarity(normalized, u.normalized) }))
    .filter((c) => c.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
  return { clerkId: null, by: null, candidates };
}
