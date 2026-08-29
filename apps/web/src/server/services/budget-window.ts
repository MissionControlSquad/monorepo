/**
 * Budget window math (Epic #4) — pure, no I/O, unit-testable.
 *
 * Given a budget window kind and an instant, returns the [start, end) bounds of the window
 * that instant falls in. Bounds anchor to UTC (the workspace default tz); DST-safe because
 * all arithmetic is on UTC fields. A `QuotaWindow` row is keyed by (policyId, windowStart),
 * so a stable windowStart is what makes the atomic upsert-increment idempotent per window.
 */
import type { BudgetWindow } from "@agentcenter/database";

export interface WindowBounds {
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Compute the [start, end) bounds of the `window` containing `now`, in UTC.
 * - hourly:   top of the hour → next hour
 * - daily:    UTC midnight → next midnight
 * - weekly:   Monday 00:00 UTC → next Monday (ISO week)
 * - monthly:  first of month 00:00 UTC → first of next month
 * - lifetime: a single perpetual window (epoch → year 9999) so ALL spend accrues to one
 *             QuotaWindow row and never rolls over. windowStart is a fixed constant, which
 *             keeps the (policyId, windowStart) upsert-increment key stable forever.
 */
// A single, never-rolling window for `lifetime` budgets. windowStart must be a fixed instant
// (it is the upsert key), so it is intentionally not derived from `now`.
const LIFETIME_START = new Date(Date.UTC(1970, 0, 1));
const LIFETIME_END = new Date(Date.UTC(9999, 0, 1));

export function windowBounds(window: BudgetWindow, now: Date, _tz = "UTC"): WindowBounds {
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = now.getUTCDate();
  const h = now.getUTCHours();

  switch (window) {
    case "hourly": {
      const start = new Date(Date.UTC(y, mo, d, h));
      const end = new Date(Date.UTC(y, mo, d, h + 1));
      return { windowStart: start, windowEnd: end };
    }
    case "daily": {
      const start = new Date(Date.UTC(y, mo, d));
      const end = new Date(Date.UTC(y, mo, d + 1));
      return { windowStart: start, windowEnd: end };
    }
    case "weekly": {
      // ISO week: Monday = 0 … Sunday = 6
      const dow = (now.getUTCDay() + 6) % 7;
      const start = new Date(Date.UTC(y, mo, d - dow));
      const end = new Date(Date.UTC(y, mo, d - dow + 7));
      return { windowStart: start, windowEnd: end };
    }
    case "monthly": {
      const start = new Date(Date.UTC(y, mo, 1));
      const end = new Date(Date.UTC(y, mo + 1, 1));
      return { windowStart: start, windowEnd: end };
    }
    case "lifetime": {
      return { windowStart: LIFETIME_START, windowEnd: LIFETIME_END };
    }
    default: {
      // Exhaustiveness guard — a new BudgetWindow value must be handled explicitly.
      const _exhaustive: never = window;
      throw new Error(`Unhandled budget window: ${String(_exhaustive)}`);
    }
  }
}
