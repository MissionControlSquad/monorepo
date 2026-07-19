/**
 * Pure 5-field cron parser + next-tick computer (Domain 9 #12 — makes cron routines fire). Shared via
 * @agentcenter/utils. Standard Vixie cron: `min hour day-of-month month day-of-week`, each field one of
 * `*`, a number, a range `a-b`, a list `a,b,c`, or a step `*​/n` / `a-b/n`. Day-of-week 0 or 7 = Sunday.
 * When BOTH day-of-month and day-of-week are restricted, a day matches if EITHER matches (Vixie rule).
 *
 * Timezone-aware via the built-in Intl API (no external dep): nextCronTick interprets the schedule in
 * the given IANA timezone. No I/O. Pure — but note `new Date()` is disallowed in some sandboxes, so the
 * caller always passes the reference instant (`after`).
 */

export interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>; // 0-6, Sunday = 0
  domRestricted: boolean;
  dowRestricted: boolean;
}

const RANGES: Record<string, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dom: [1, 31],
  month: [1, 12],
  dow: [0, 6],
};

function parseField(raw: string, kind: keyof typeof RANGES): Set<number> {
  const [min, max] = RANGES[kind];
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) throw new Error(`empty cron field segment in "${raw}"`);
    const [rangePart, stepPart] = token.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`invalid cron step "${stepPart}"`);

    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-").map(Number);
      lo = a;
      hi = b;
    } else {
      lo = Number(rangePart);
      hi = lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi))
      throw new Error(`invalid cron value "${rangePart}"`);
    // dow 7 → 0 (Sunday). Normalize before range checks.
    if (kind === "dow") {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }
    if (lo > hi) throw new Error(`cron range out of order "${rangePart}"`);
    if (lo < min || hi > max) throw new Error(`cron value out of range "${token}" for ${kind}`);
    for (let n = lo; n <= hi; n += step) out.add(n);
  }
  return out;
}

/** Parse a 5-field cron expression into matchable sets. Throws on malformed input. */
export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5)
    throw new Error(`cron expression must have 5 fields, got ${parts.length}: "${expr}"`);
  const [m, h, dom, mon, dow] = parts;
  return {
    minutes: parseField(m, "minute"),
    hours: parseField(h, "hour"),
    daysOfMonth: parseField(dom, "dom"),
    months: parseField(mon, "month"),
    daysOfWeek: parseField(dow, "dow"),
    domRestricted: dom.trim() !== "*",
    dowRestricted: dow.trim() !== "*",
  };
}

/** True when the expression parses. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  dow: number; // 0-6, Sun = 0
}

const DOW_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** The wall-clock parts of a UTC instant in the given IANA timezone (via Intl; no external dep). */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // some ICU builds emit "24" for midnight
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    dow: DOW_INDEX[parts.weekday] ?? 0,
  };
}

function dateMatches(fields: CronFields, p: ZonedParts): boolean {
  if (!fields.months.has(p.month)) return false;
  // Vixie rule: if BOTH dom and dow are restricted, either may match; else the restricted one must.
  if (fields.domRestricted && fields.dowRestricted) {
    return fields.daysOfMonth.has(p.day) || fields.daysOfWeek.has(p.dow);
  }
  if (fields.domRestricted) return fields.daysOfMonth.has(p.day);
  if (fields.dowRestricted) return fields.daysOfWeek.has(p.dow);
  return true;
}

/**
 * The next instant strictly after `after` at which `expr` fires, interpreted in `timeZone`. Returns
 * null for a schedule that can never match (e.g. Feb 30) within a ~4-year horizon. Minute-resolution.
 */
export function nextCronTick(expr: string, after: Date, timeZone = "UTC"): Date | null {
  const fields = parseCron(expr);
  const MINUTE = 60000;
  // Start at the next whole-minute boundary strictly after `after`.
  let cursor = new Date(Math.floor(after.getTime() / 60000) * 60000 + MINUTE);
  // Bound the search by TIME (~4 years), not iteration count: because a non-matching day is skipped
  // whole, an iteration can advance a full day, so a minute-count cap would let the cursor run for
  // millennia on an impossible schedule (e.g. Feb 30). A date horizon bails after ~4 years of skips.
  const horizon = after.getTime() + 366 * 24 * 60 * 60 * 1000 * 4;
  while (cursor.getTime() <= horizon) {
    const p = zonedParts(cursor, timeZone);
    if (!dateMatches(fields, p)) {
      // Skip the rest of this local day fast: jump to ~local midnight, then let the loop re-align.
      const minsIntoDay = p.hour * 60 + p.minute;
      cursor = new Date(cursor.getTime() + (24 * 60 - minsIntoDay) * MINUTE);
      continue;
    }
    if (fields.hours.has(p.hour) && fields.minutes.has(p.minute)) return cursor;
    cursor = new Date(cursor.getTime() + MINUTE);
  }
  return null;
}
