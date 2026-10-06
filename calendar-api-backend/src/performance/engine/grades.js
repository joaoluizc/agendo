export function round1(x) {
  return x == null ? null : Math.round(x * 10) / 10;
}

/**
 * The first band whose minimum the (already rounded) score reaches. Bands are ordered
 * high to low; the last one has `min: null` and catches everything else.
 */
export function gradeFor(score, grades) {
  if (score == null) return null;
  for (const band of grades) {
    if (band.min == null || score >= band.min) return band.grade;
  }
  return null;
}
