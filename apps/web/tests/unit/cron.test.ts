import { describe, it, expect } from "vitest";
import { parseCron, isValidCron, nextCronTick } from "@agentcenter/utils";

describe("parseCron / isValidCron (Domain 9 #12)", () => {
  it("accepts *, numbers, ranges, lists and steps", () => {
    expect(isValidCron("* * * * *")).toBe(true);
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
    expect(isValidCron("*/15 0,12 1 */2 *")).toBe(true);
    expect(isValidCron("0 0 * * 7")).toBe(true); // 7 == Sunday
  });

  it("rejects malformed / out-of-range expressions", () => {
    expect(isValidCron("")).toBe(false);
    expect(isValidCron("* * * *")).toBe(false); // 4 fields
    expect(isValidCron("60 * * * *")).toBe(false); // minute out of range
    expect(isValidCron("* 24 * * *")).toBe(false); // hour out of range
    expect(isValidCron("* * 0 * *")).toBe(false); // day-of-month min is 1
    expect(isValidCron("* * * 13 *")).toBe(false); // month out of range
    expect(isValidCron("* * * * 8")).toBe(false); // dow out of range
    expect(isValidCron("5-1 * * * *")).toBe(false); // reversed range
    expect(isValidCron("*/0 * * * *")).toBe(false); // zero step
  });

  it("expands fields into the expected sets", () => {
    const f = parseCron("*/20 9-11 * * 1-5");
    expect([...f.minutes]).toEqual([0, 20, 40]);
    expect([...f.hours]).toEqual([9, 10, 11]);
    expect(f.domRestricted).toBe(false);
    expect(f.dowRestricted).toBe(true);
    expect([...f.daysOfWeek]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("nextCronTick", () => {
  it("finds the next matching minute (UTC)", () => {
    // 09:00 every day
    const after = new Date("2026-07-19T08:30:00Z");
    expect(nextCronTick("0 9 * * *", after)?.toISOString()).toBe("2026-07-19T09:00:00.000Z");
    // already past today's 09:00 → tomorrow
    const after2 = new Date("2026-07-19T09:30:00Z");
    expect(nextCronTick("0 9 * * *", after2)?.toISOString()).toBe("2026-07-20T09:00:00.000Z");
  });

  it("advances strictly (an exact match instant returns the NEXT one)", () => {
    const at = new Date("2026-07-19T09:00:00Z");
    expect(nextCronTick("0 9 * * *", at)?.toISOString()).toBe("2026-07-20T09:00:00.000Z");
  });

  it("honors a step and a weekday restriction", () => {
    // every 15 min — next quarter hour
    expect(nextCronTick("*/15 * * * *", new Date("2026-07-19T10:07:00Z"))?.toISOString()).toBe(
      "2026-07-19T10:15:00.000Z",
    );
    // Mondays at 00:00 — 2026-07-19 is a Sunday, so next is Monday the 20th
    expect(nextCronTick("0 0 * * 1", new Date("2026-07-19T12:00:00Z"))?.toISOString()).toBe(
      "2026-07-20T00:00:00.000Z",
    );
  });

  it("interprets the schedule in the given timezone", () => {
    // 09:00 America/New_York on 2026-07-19 (EDT, UTC-4) == 13:00 UTC
    const after = new Date("2026-07-19T00:00:00Z");
    expect(nextCronTick("0 9 * * *", after, "America/New_York")?.toISOString()).toBe(
      "2026-07-19T13:00:00.000Z",
    );
  });

  it("returns null for an impossible schedule (Feb 30)", () => {
    expect(nextCronTick("0 0 30 2 *", new Date("2026-01-01T00:00:00Z"))).toBeNull();
  });
});
