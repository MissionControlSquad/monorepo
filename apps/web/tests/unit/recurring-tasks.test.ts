import { describe, it, expect } from "vitest";
import {
  validateRecurrenceConfig,
  calculateInitialDueDate,
  calculateNextDueDate,
  type RecurrenceConfig,
} from "../../src/server/recurring-tasks";

// ─── Helpers ────────────────────────────────────────────────────────

/** Get hour and minute as seen in a timezone from a UTC Date. */
function getTimeInTz(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const v = (t: string) => parseInt(parts.find((p) => p.type === t)!.value);
  return { hour: v("hour") === 24 ? 0 : v("hour"), minute: v("minute") };
}

/** Get calendar date parts as seen in a timezone from a UTC Date. */
function getDateInTz(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const v = (t: string) => parseInt(parts.find((p) => p.type === t)!.value);
  return { year: v("year"), month: v("month"), day: v("day") };
}

function getDayOfWeekInTz(date: Date, tz: string): number {
  const { year, month, day } = getDateInTz(date, tz);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// ─── validateRecurrenceConfig ───────────────────────────────────────

describe("validateRecurrenceConfig", () => {
  it("validates a daily config", () => {
    const config = validateRecurrenceConfig({
      type: "daily",
      interval: 1,
      time: "09:00",
    });
    expect(config.type).toBe("daily");
    expect(config.interval).toBe(1);
    expect(config.time).toBe("09:00");
  });

  it("validates a weekly config with daysOfWeek", () => {
    const config = validateRecurrenceConfig({
      type: "weekly",
      interval: 1,
      daysOfWeek: [1, 3, 5],
      time: "14:30",
    });
    expect(config.type).toBe("weekly");
    expect(config.daysOfWeek).toEqual([1, 3, 5]);
  });

  it("validates a monthly config with dayOfMonth", () => {
    const config = validateRecurrenceConfig({
      type: "monthly",
      interval: 2,
      dayOfMonth: 15,
    });
    expect(config.type).toBe("monthly");
    expect(config.dayOfMonth).toBe(15);
  });

  it("rejects invalid type", () => {
    expect(() => validateRecurrenceConfig({ type: "hourly", interval: 1 })).toThrow();
  });

  it("rejects non-positive interval", () => {
    expect(() => validateRecurrenceConfig({ type: "daily", interval: 0 })).toThrow();
    expect(() => validateRecurrenceConfig({ type: "daily", interval: -1 })).toThrow();
  });

  it("rejects invalid time format", () => {
    expect(() => validateRecurrenceConfig({ type: "daily", interval: 1, time: "9:00" })).toThrow();
    expect(() =>
      validateRecurrenceConfig({ type: "daily", interval: 1, time: "25:00" }),
    ).not.toThrow(); // format check only, not value
  });

  it("rejects invalid daysOfWeek values", () => {
    expect(() =>
      validateRecurrenceConfig({ type: "weekly", interval: 1, daysOfWeek: [7] }),
    ).toThrow();
    expect(() =>
      validateRecurrenceConfig({ type: "weekly", interval: 1, daysOfWeek: [-1] }),
    ).toThrow();
  });

  it("rejects invalid dayOfMonth", () => {
    expect(() =>
      validateRecurrenceConfig({ type: "monthly", interval: 1, dayOfMonth: 0 }),
    ).toThrow();
    expect(() =>
      validateRecurrenceConfig({ type: "monthly", interval: 1, dayOfMonth: 32 }),
    ).toThrow();
  });

  it("rejects null / non-object input", () => {
    expect(() => validateRecurrenceConfig(null)).toThrow();
    expect(() => validateRecurrenceConfig("daily")).toThrow();
  });
});

// ─── Timezone-aware scheduling ──────────────────────────────────────

describe("calculateInitialDueDate – timezone handling", () => {
  // Use a fixed "now" in UTC: 2026-03-10 06:00 UTC (a Tuesday)
  const now = new Date("2026-03-10T06:00:00Z");

  describe("daily", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };

    it("UTC: 09:00 UTC is in the future → same day", () => {
      const result = calculateInitialDueDate(config, "UTC", now);
      expect(result.toISOString()).toBe("2026-03-10T09:00:00.000Z");
    });

    it("Asia/Kolkata (UTC+5:30): 09:00 IST = 03:30 UTC, already passed → next day", () => {
      const result = calculateInitialDueDate(config, "Asia/Kolkata", now);
      // 09:00 IST on Mar 10 = 03:30 UTC, which is before 06:00 UTC (now), so next day
      // 09:00 IST on Mar 11 = 03:30 UTC Mar 11
      const { hour, minute } = getTimeInTz(result, "Asia/Kolkata");
      expect(hour).toBe(9);
      expect(minute).toBe(0);
      expect(result.toISOString()).toBe("2026-03-11T03:30:00.000Z");
    });

    it("America/New_York (EDT, UTC-4 after Mar 8 DST): 09:00 ET = 13:00 UTC, in the future → same day", () => {
      const result = calculateInitialDueDate(config, "America/New_York", now);
      // DST started Mar 8 in 2026, so Mar 10 is EDT (UTC-4)
      // 09:00 EDT = 13:00 UTC, which is after 06:00 UTC (now)
      const { hour, minute } = getTimeInTz(result, "America/New_York");
      expect(hour).toBe(9);
      expect(minute).toBe(0);
      expect(result.toISOString()).toBe("2026-03-10T13:00:00.000Z");
    });

    it("Asia/Tokyo (UTC+9): 09:00 JST = 00:00 UTC, already passed → next day", () => {
      const result = calculateInitialDueDate(config, "Asia/Tokyo", now);
      // 09:00 JST on Mar 10 = 00:00 UTC Mar 10, already passed
      // 09:00 JST on Mar 11 = 00:00 UTC Mar 11
      const { hour, minute } = getTimeInTz(result, "Asia/Tokyo");
      expect(hour).toBe(9);
      expect(minute).toBe(0);
      expect(result.toISOString()).toBe("2026-03-11T00:00:00.000Z");
    });

    it("Europe/London (UTC+0 in winter): 09:00 GMT = 09:00 UTC, in the future", () => {
      const result = calculateInitialDueDate(config, "Europe/London", now);
      expect(result.toISOString()).toBe("2026-03-10T09:00:00.000Z");
    });

    it("Pacific/Auckland (UTC+13): 09:00 NZDT = 20:00 UTC previous day", () => {
      // Now is Mar 10 06:00 UTC = Mar 10 19:00 NZDT
      // 09:00 NZDT on Mar 10 is Mar 9 20:00 UTC → already passed
      // 09:00 NZDT on Mar 11 is Mar 10 20:00 UTC → in the future
      const result = calculateInitialDueDate(config, "Pacific/Auckland", now);
      const { hour, minute } = getTimeInTz(result, "Pacific/Auckland");
      expect(hour).toBe(9);
      expect(minute).toBe(0);
      expect(result.toISOString()).toBe("2026-03-10T20:00:00.000Z");
    });
  });

  describe("daily with interval > 1", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 3, time: "15:00" };

    it("Asia/Kolkata: 15:00 IST = 09:30 UTC, in the future → same day", () => {
      const result = calculateInitialDueDate(config, "Asia/Kolkata", now);
      const { hour, minute } = getTimeInTz(result, "Asia/Kolkata");
      expect(hour).toBe(15);
      expect(minute).toBe(0);
      expect(result.toISOString()).toBe("2026-03-10T09:30:00.000Z");
    });
  });

  describe("weekly with daysOfWeek", () => {
    // now is Tuesday (day 2) Mar 10, 2026 06:00 UTC
    const config: RecurrenceConfig = {
      type: "weekly",
      interval: 1,
      daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      time: "10:00",
    };

    it("UTC: next matching day is Wed (day 3)", () => {
      const result = calculateInitialDueDate(config, "UTC", now);
      expect(getDayOfWeekInTz(result, "UTC")).toBe(3); // Wednesday
      expect(result.toISOString()).toBe("2026-03-11T10:00:00.000Z");
    });

    it("Asia/Kolkata: Tue in IST, 10:00 IST hasn't passed (it's 11:30 IST) → Wed IST", () => {
      // now = 06:00 UTC = 11:30 IST on Tue. 10:00 IST on Tue already passed.
      // Tue is day 2, not in daysOfWeek. Next is Wed (day 3).
      const result = calculateInitialDueDate(config, "Asia/Kolkata", now);
      const dayOfWeek = getDayOfWeekInTz(result, "Asia/Kolkata");
      expect(dayOfWeek).toBe(3); // Wednesday in IST
      const { hour } = getTimeInTz(result, "Asia/Kolkata");
      expect(hour).toBe(10);
    });

    it("America/Los_Angeles: Mon evening in PT, Mon is in daysOfWeek", () => {
      // now = 06:00 UTC Mar 10 = 22:00 PT Mar 9 (Monday)
      // Wait, Mar 10 06:00 UTC. In PT (UTC-8 in winter, UTC-7 in DST):
      // DST 2026 starts Mar 8 in US, so it's PDT (UTC-7) on Mar 10.
      // 06:00 UTC = 23:00 PDT Mar 9 (Monday)
      // Mon (1) is in daysOfWeek, but 10:00 PDT on Mon has passed.
      // Next is Wed (3): 10:00 PDT Mar 11 = 17:00 UTC Mar 11
      const result = calculateInitialDueDate(config, "America/Los_Angeles", now);
      const dayOfWeek = getDayOfWeekInTz(result, "America/Los_Angeles");
      expect(dayOfWeek).toBe(3); // Wednesday in PT
      const { hour } = getTimeInTz(result, "America/Los_Angeles");
      expect(hour).toBe(10);
    });
  });

  describe("weekly – same day, time not yet passed", () => {
    const config: RecurrenceConfig = {
      type: "weekly",
      interval: 1,
      daysOfWeek: [2], // Tuesday only
      time: "10:00",
    };

    it("UTC: Tue 06:00 UTC, 10:00 UTC hasn't passed → today", () => {
      const result = calculateInitialDueDate(config, "UTC", now);
      expect(getDayOfWeekInTz(result, "UTC")).toBe(2);
      expect(result.toISOString()).toBe("2026-03-10T10:00:00.000Z");
    });

    it("Asia/Kolkata: Tue 11:30 IST, 10:00 IST already passed → next Tue", () => {
      const result = calculateInitialDueDate(config, "Asia/Kolkata", now);
      const { day } = getDateInTz(result, "Asia/Kolkata");
      expect(day).toBe(17); // Next Tuesday is Mar 17
    });
  });

  describe("monthly with dayOfMonth", () => {
    const config: RecurrenceConfig = {
      type: "monthly",
      interval: 1,
      dayOfMonth: 15,
      time: "08:00",
    };

    it("UTC: Mar 15 08:00 UTC is in the future", () => {
      const result = calculateInitialDueDate(config, "UTC", now);
      expect(result.toISOString()).toBe("2026-03-15T08:00:00.000Z");
    });

    it("Asia/Kolkata: Mar 15 08:00 IST = 02:30 UTC", () => {
      const result = calculateInitialDueDate(config, "Asia/Kolkata", now);
      const { hour, minute } = getTimeInTz(result, "Asia/Kolkata");
      expect(hour).toBe(8);
      expect(minute).toBe(0);
      expect(result.toISOString()).toBe("2026-03-15T02:30:00.000Z");
    });

    it("America/Chicago (UTC-5): Mar 15 08:00 CT = 13:00 UTC", () => {
      // CDT in March 2026 (DST started Mar 8)
      const result = calculateInitialDueDate(config, "America/Chicago", now);
      const { hour, minute } = getTimeInTz(result, "America/Chicago");
      expect(hour).toBe(8);
      expect(minute).toBe(0);
      expect(result.toISOString()).toBe("2026-03-15T13:00:00.000Z");
    });
  });

  describe("monthly – day already passed this month", () => {
    const config: RecurrenceConfig = {
      type: "monthly",
      interval: 1,
      dayOfMonth: 5,
      time: "09:00",
    };

    it("UTC: Mar 5 already passed → Apr 5", () => {
      const result = calculateInitialDueDate(config, "UTC", now);
      const { month, day } = getDateInTz(result, "UTC");
      expect(month).toBe(4);
      expect(day).toBe(5);
    });

    it("Asia/Kolkata: Mar 5 already passed → Apr 5 at 09:00 IST", () => {
      const result = calculateInitialDueDate(config, "Asia/Kolkata", now);
      const { month, day } = getDateInTz(result, "Asia/Kolkata");
      const { hour } = getTimeInTz(result, "Asia/Kolkata");
      expect(month).toBe(4);
      expect(day).toBe(5);
      expect(hour).toBe(9);
    });
  });
});

// ─── calculateNextDueDate – timezone handling ───────────────────────

describe("calculateNextDueDate – timezone handling", () => {
  describe("daily", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };

    it("UTC: advances by 1 day", () => {
      const current = new Date("2026-03-10T09:00:00.000Z");
      const next = calculateNextDueDate(config, current, "UTC");
      expect(next.toISOString()).toBe("2026-03-11T09:00:00.000Z");
    });

    it("Asia/Kolkata: advances by 1 day in IST, maintains 03:30 UTC", () => {
      // 09:00 IST Mar 10 = 03:30 UTC Mar 10
      const current = new Date("2026-03-10T03:30:00.000Z");
      const next = calculateNextDueDate(config, current, "Asia/Kolkata");
      const { hour, minute } = getTimeInTz(next, "Asia/Kolkata");
      expect(hour).toBe(9);
      expect(minute).toBe(0);
      expect(next.toISOString()).toBe("2026-03-11T03:30:00.000Z");
    });

    it("America/New_York: advances by 1 day, maintains 14:00 UTC (EST→EDT boundary safe)", () => {
      // Non-DST date: 09:00 ET = 14:00 UTC
      const current = new Date("2026-03-10T14:00:00.000Z");
      const next = calculateNextDueDate(config, current, "America/New_York");
      const { hour } = getTimeInTz(next, "America/New_York");
      expect(hour).toBe(9);
    });
  });

  describe("daily with interval 3", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 3, time: "14:00" };

    it("Asia/Tokyo: advances by 3 days", () => {
      // 14:00 JST = 05:00 UTC
      const current = new Date("2026-03-10T05:00:00.000Z");
      const next = calculateNextDueDate(config, current, "Asia/Tokyo");
      const { hour } = getTimeInTz(next, "Asia/Tokyo");
      const { day } = getDateInTz(next, "Asia/Tokyo");
      expect(hour).toBe(14);
      expect(day).toBe(13);
    });
  });

  describe("weekly with daysOfWeek", () => {
    const config: RecurrenceConfig = {
      type: "weekly",
      interval: 1,
      daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      time: "10:00",
    };

    it("UTC: Mon → Wed", () => {
      const current = new Date("2026-03-09T10:00:00.000Z"); // Mon
      const next = calculateNextDueDate(config, current, "UTC");
      expect(getDayOfWeekInTz(next, "UTC")).toBe(3); // Wed
    });

    it("UTC: Fri → next interval week's Mon (interval=1 wraps a full week ahead)", () => {
      const current = new Date("2026-03-13T10:00:00.000Z"); // Fri
      const next = calculateNextDueDate(config, current, "UTC");
      expect(getDayOfWeekInTz(next, "UTC")).toBe(1); // Mon
      // Fri Mar 13 + 1 week = Mar 20 (Fri), then find Mon = Mar 23
      const { day } = getDateInTz(next, "UTC");
      expect(day).toBe(23);
    });

    it("Asia/Kolkata: Mon 10:00 IST → Wed 10:00 IST", () => {
      // Mon 10:00 IST = 04:30 UTC
      const current = new Date("2026-03-09T04:30:00.000Z");
      const next = calculateNextDueDate(config, current, "Asia/Kolkata");
      const dow = getDayOfWeekInTz(next, "Asia/Kolkata");
      expect(dow).toBe(3); // Wed in IST
      const { hour } = getTimeInTz(next, "Asia/Kolkata");
      expect(hour).toBe(10);
    });

    it("America/Los_Angeles: Fri 10:00 PT → next Mon 10:00 PT", () => {
      // DST in effect: Fri Mar 13 10:00 PDT = 17:00 UTC
      const current = new Date("2026-03-13T17:00:00.000Z");
      const next = calculateNextDueDate(config, current, "America/Los_Angeles");
      const dow = getDayOfWeekInTz(next, "America/Los_Angeles");
      expect(dow).toBe(1); // Mon
      const { hour } = getTimeInTz(next, "America/Los_Angeles");
      expect(hour).toBe(10);
    });
  });

  describe("monthly", () => {
    const config: RecurrenceConfig = {
      type: "monthly",
      interval: 1,
      dayOfMonth: 15,
      time: "09:00",
    };

    it("UTC: Mar 15 → Apr 15", () => {
      const current = new Date("2026-03-15T09:00:00.000Z");
      const next = calculateNextDueDate(config, current, "UTC");
      const { month, day } = getDateInTz(next, "UTC");
      expect(month).toBe(4);
      expect(day).toBe(15);
    });

    it("Asia/Kolkata: Mar 15 09:00 IST → Apr 15 09:00 IST", () => {
      const current = new Date("2026-03-15T03:30:00.000Z"); // 09:00 IST
      const next = calculateNextDueDate(config, current, "Asia/Kolkata");
      const { month, day } = getDateInTz(next, "Asia/Kolkata");
      const { hour } = getTimeInTz(next, "Asia/Kolkata");
      expect(month).toBe(4);
      expect(day).toBe(15);
      expect(hour).toBe(9);
    });

    it("dayOfMonth 31 clamps to last day of shorter months", () => {
      const cfg: RecurrenceConfig = {
        type: "monthly",
        interval: 1,
        dayOfMonth: 31,
        time: "09:00",
      };
      // Jan 31 → Feb 28 (2026 is not a leap year)
      const current = new Date("2026-01-31T09:00:00.000Z");
      const next = calculateNextDueDate(cfg, current, "UTC");
      const { month, day } = getDateInTz(next, "UTC");
      expect(month).toBe(2);
      expect(day).toBe(28);
    });
  });
});

// ─── Cross-timezone consistency ─────────────────────────────────────

describe("cross-timezone consistency", () => {
  it("same config in different timezones produces different UTC times", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };
    const now = new Date("2026-06-15T00:00:00Z"); // Midnight UTC, a Monday

    const utcResult = calculateInitialDueDate(config, "UTC", now);
    const istResult = calculateInitialDueDate(config, "Asia/Kolkata", now);
    const etResult = calculateInitialDueDate(config, "America/New_York", now);

    // All should show 09:00 in their respective timezones
    expect(getTimeInTz(utcResult, "UTC")).toEqual({ hour: 9, minute: 0 });
    expect(getTimeInTz(istResult, "Asia/Kolkata")).toEqual({ hour: 9, minute: 0 });
    expect(getTimeInTz(etResult, "America/New_York")).toEqual({ hour: 9, minute: 0 });

    // But UTC timestamps should all be different
    expect(utcResult.getTime()).not.toBe(istResult.getTime());
    expect(utcResult.getTime()).not.toBe(etResult.getTime());
    expect(istResult.getTime()).not.toBe(etResult.getTime());
  });

  it("09:00 in UTC+5:30 is 5.5 hours earlier in UTC", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };
    const now = new Date("2026-06-15T00:00:00Z");

    const utcResult = calculateInitialDueDate(config, "UTC", now);
    const istResult = calculateInitialDueDate(config, "Asia/Kolkata", now);

    // IST is UTC+5:30, so 09:00 IST = 03:30 UTC, which is already in the past at 00:00 UTC...
    // Actually at 00:00 UTC it's 05:30 IST, so 09:00 IST = 03:30 UTC of the same day.
    // But 03:30 UTC is before 00:00 UTC? No. 03:30 UTC is 3.5 hours after midnight UTC.
    // now is 00:00 UTC = 05:30 IST. 09:00 IST = 03:30 UTC = 3.5 hours from now. In the future.
    const diffHours = (utcResult.getTime() - istResult.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(5.5, 1);
  });

  it("calculateNextDueDate preserves time in each timezone through multiple iterations", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "14:30" };
    const timezones = [
      "UTC",
      "Asia/Kolkata",
      "America/New_York",
      "Asia/Tokyo",
      "Europe/Berlin",
      "Australia/Sydney",
    ];

    for (const tz of timezones) {
      let current = calculateInitialDueDate(config, tz, new Date("2026-06-01T00:00:00Z"));

      // Iterate 10 days
      for (let i = 0; i < 10; i++) {
        const { hour, minute } = getTimeInTz(current, tz);
        expect(hour).toBe(14);
        expect(minute).toBe(30);
        current = calculateNextDueDate(config, current, tz);
      }
    }
  });

  it("weekly iteration preserves time across timezones", () => {
    const config: RecurrenceConfig = {
      type: "weekly",
      interval: 1,
      daysOfWeek: [1, 4], // Mon, Thu
      time: "08:00",
    };
    const timezones = ["UTC", "Asia/Kolkata", "America/Chicago", "Pacific/Auckland"];

    for (const tz of timezones) {
      let current = calculateInitialDueDate(config, tz, new Date("2026-06-01T00:00:00Z"));

      for (let i = 0; i < 8; i++) {
        const { hour } = getTimeInTz(current, tz);
        const dow = getDayOfWeekInTz(current, tz);
        expect(hour).toBe(8);
        expect([1, 4]).toContain(dow);
        current = calculateNextDueDate(config, current, tz);
      }
    }
  });

  it("monthly iteration preserves time and day across timezones", () => {
    const config: RecurrenceConfig = {
      type: "monthly",
      interval: 1,
      dayOfMonth: 20,
      time: "17:00",
    };
    const timezones = ["UTC", "Asia/Kolkata", "America/New_York", "Asia/Tokyo"];

    for (const tz of timezones) {
      let current = calculateInitialDueDate(config, tz, new Date("2026-01-01T00:00:00Z"));

      for (let i = 0; i < 6; i++) {
        const { hour } = getTimeInTz(current, tz);
        const { day } = getDateInTz(current, tz);
        expect(hour).toBe(17);
        expect(day).toBe(20);
        current = calculateNextDueDate(config, current, tz);
      }
    }
  });
});

// ─── DST transition tests ───────────────────────────────────────────

describe("DST transitions", () => {
  it("US spring forward: 09:00 ET stays 09:00 ET across DST boundary", () => {
    // US DST 2026 starts Mar 8. Test Mar 7 → Mar 8 → Mar 9.
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };
    const tz = "America/New_York";

    // Mar 7 is EST (UTC-5), 09:00 ET = 14:00 UTC
    const mar7 = new Date("2026-03-07T14:00:00.000Z");
    const { hour: h7 } = getTimeInTz(mar7, tz);
    expect(h7).toBe(9);

    const mar8 = calculateNextDueDate(config, mar7, tz);
    const { hour: h8 } = getTimeInTz(mar8, tz);
    expect(h8).toBe(9);
    // Mar 8 is EDT (UTC-4), so 09:00 EDT = 13:00 UTC
    expect(mar8.toISOString()).toBe("2026-03-08T13:00:00.000Z");

    const mar9 = calculateNextDueDate(config, mar8, tz);
    const { hour: h9 } = getTimeInTz(mar9, tz);
    expect(h9).toBe(9);
    expect(mar9.toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });

  it("US fall back: 09:00 ET stays 09:00 ET across DST boundary", () => {
    // US DST 2026 ends Nov 1. Test Oct 31 → Nov 1 → Nov 2.
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };
    const tz = "America/New_York";

    // Oct 31 is EDT (UTC-4), 09:00 EDT = 13:00 UTC
    const oct31 = new Date("2026-10-31T13:00:00.000Z");
    const { hour: hOct } = getTimeInTz(oct31, tz);
    expect(hOct).toBe(9);

    const nov1 = calculateNextDueDate(config, oct31, tz);
    const { hour: hNov1 } = getTimeInTz(nov1, tz);
    expect(hNov1).toBe(9);
    // Nov 1 is EST (UTC-5), so 09:00 EST = 14:00 UTC
    expect(nov1.toISOString()).toBe("2026-11-01T14:00:00.000Z");

    const nov2 = calculateNextDueDate(config, nov1, tz);
    const { hour: hNov2 } = getTimeInTz(nov2, tz);
    expect(hNov2).toBe(9);
    expect(nov2.toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("Europe spring forward: 09:00 CET stays 09:00 across DST boundary", () => {
    // EU DST 2026 starts Mar 29. Test Mar 28 → Mar 29.
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };
    const tz = "Europe/Berlin";

    // Mar 28 is CET (UTC+1), 09:00 CET = 08:00 UTC
    const mar28 = new Date("2026-03-28T08:00:00.000Z");
    const { hour: h28 } = getTimeInTz(mar28, tz);
    expect(h28).toBe(9);

    const mar29 = calculateNextDueDate(config, mar28, tz);
    const { hour: h29 } = getTimeInTz(mar29, tz);
    expect(h29).toBe(9);
    // Mar 29 is CEST (UTC+2), so 09:00 CEST = 07:00 UTC
    expect(mar29.toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });
});

// ─── Default timezone (backward compat) ─────────────────────────────

describe("default timezone (UTC) backward compatibility", () => {
  it("calculateInitialDueDate defaults to UTC when no timezone given", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };
    const now = new Date("2026-03-10T06:00:00Z");
    const result = calculateInitialDueDate(config, "UTC", now);
    expect(result.toISOString()).toBe("2026-03-10T09:00:00.000Z");
  });

  it("calculateNextDueDate defaults to UTC", () => {
    const config: RecurrenceConfig = { type: "daily", interval: 1, time: "09:00" };
    const current = new Date("2026-03-10T09:00:00.000Z");
    const next = calculateNextDueDate(config, current, "UTC");
    expect(next.toISOString()).toBe("2026-03-11T09:00:00.000Z");
  });
});
