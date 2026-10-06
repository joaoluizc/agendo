/**
 * Descriptive statistics for a cohort. Population σ (divide by n): a cohort is the whole
 * team for that quarter, not a sample of a bigger one.
 */
export function describe(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return { n: 0, mean: null, sd: null, median: null, min: null, max: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { n, mean, sd, median, min: sorted[0], max: sorted[n - 1] };
}

/** z-score, or null when the cohort is too small (or too uniform) for σ to mean anything. */
export function zScore(value, stats, minN) {
  if (value == null || !stats || stats.n < minN || !(stats.sd > 0)) return null;
  return (value - stats.mean) / stats.sd;
}
