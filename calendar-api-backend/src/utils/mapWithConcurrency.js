/**
 * Run `fn` over `items` with at most `limit` in flight, preserving input order in the
 * result.
 *
 * For the bulk shift paths, where each item costs Clerk and Google round-trips: fully
 * serial made a full day take minutes, fully parallel invites rate limits. A handful at
 * a time is the middle.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}
