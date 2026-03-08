/**
 * Convert raw user input into a safe PostgreSQL tsquery string.
 *
 * - Strips characters invalid in tsquery
 * - Joins words with & (AND logic)
 * - Appends :* to the last word for prefix/typeahead matching
 * - Returns "" for empty or garbage input (caller should short-circuit)
 *
 * Examples:
 *   "fix login bug"  → "fix & login & bug:*"
 *   "deploy"         → "deploy:*"
 *   "  "             → ""
 */
export function toSearchQuery(raw: string): string {
  const words = raw
    .replace(/[^a-zA-Z0-9\s]/g, "") // strip non-alphanumeric (except spaces)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "";

  const last = words.length - 1;
  return words.map((w, i) => (i === last ? `${w}:*` : w)).join(" & ");
}
