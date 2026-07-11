/**
 * Ledger timeline bucket math (Epic #16) — pure, no I/O, unit-testable. UTC-anchored so
 * day/week/month boundaries are DST-safe. Used to build zero-filled P&L timelines.
 */
export type LedgerBucketKind = "day" | "week" | "month";

export interface LedgerBucket {
  bucketStart: Date;
  bucketEnd: Date;
}

/** UTC-anchored start of the bucket containing `date` (day midnight / ISO-week Monday / month 1st). */
export function bucketStartOf(date: Date, kind: LedgerBucketKind): Date {
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  switch (kind) {
    case "day":
      return new Date(Date.UTC(y, mo, d));
    case "week": {
      const dow = (date.getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
      return new Date(Date.UTC(y, mo, d - dow));
    }
    case "month":
      return new Date(Date.UTC(y, mo, 1));
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled bucket kind: ${String(_exhaustive)}`);
    }
  }
}

/** Start of the bucket immediately after the one starting at `start`. */
export function nextBucketStart(start: Date, kind: LedgerBucketKind): Date {
  const y = start.getUTCFullYear();
  const mo = start.getUTCMonth();
  const d = start.getUTCDate();
  switch (kind) {
    case "day":
      return new Date(Date.UTC(y, mo, d + 1));
    case "week":
      return new Date(Date.UTC(y, mo, d + 7));
    case "month":
      return new Date(Date.UTC(y, mo + 1, 1));
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled bucket kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Enumerate every bucket covering [from, to] (inclusive of the bucket containing `to`), in order.
 * Empty buckets are included so the caller can zero-fill. Guards against inverted ranges.
 */
export function enumerateBuckets(from: Date, to: Date, kind: LedgerBucketKind): LedgerBucket[] {
  if (to < from) return [];
  const buckets: LedgerBucket[] = [];
  let start = bucketStartOf(from, kind);
  const last = bucketStartOf(to, kind);
  // Hard cap to avoid pathological ranges producing unbounded arrays.
  for (let i = 0; i < 3660 && start <= last; i++) {
    const end = nextBucketStart(start, kind);
    buckets.push({ bucketStart: start, bucketEnd: end });
    start = end;
  }
  return buckets;
}
