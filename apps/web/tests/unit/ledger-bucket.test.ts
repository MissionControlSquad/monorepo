import { describe, it, expect } from "vitest";
import { bucketStartOf, nextBucketStart, enumerateBuckets } from "@/server/services/ledger-bucket";
import { reduceSummary, validateAmountCents, normalizeCurrency } from "@/server/services/ledger";

describe("bucketStartOf", () => {
  const wed = new Date("2026-03-11T14:37:05.123Z"); // Wednesday
  it("day → UTC midnight", () => {
    expect(bucketStartOf(wed, "day").toISOString()).toBe("2026-03-11T00:00:00.000Z");
  });
  it("week → ISO Monday", () => {
    expect(bucketStartOf(wed, "week").toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });
  it("month → first of month", () => {
    expect(bucketStartOf(wed, "month").toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
  it("month rolls the year in December", () => {
    const dec = new Date("2026-12-20T00:00:00.000Z");
    expect(nextBucketStart(bucketStartOf(dec, "month"), "month").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("enumerateBuckets", () => {
  it("covers a 3-day range with 3 daily buckets", () => {
    const from = new Date("2026-03-11T09:00:00Z");
    const to = new Date("2026-03-13T20:00:00Z");
    const buckets = enumerateBuckets(from, to, "day");
    expect(buckets.map((b) => b.bucketStart.toISOString())).toEqual([
      "2026-03-11T00:00:00.000Z",
      "2026-03-12T00:00:00.000Z",
      "2026-03-13T00:00:00.000Z",
    ]);
  });
  it("returns [] for an inverted range", () => {
    expect(enumerateBuckets(new Date("2026-03-13Z"), new Date("2026-03-11Z"), "day")).toEqual([]);
  });
});

describe("reduceSummary (integer cents)", () => {
  it("sums revenue/expense and nets exactly, count included", () => {
    const s = reduceSummary([
      { kind: "revenue", amountCents: 12345 },
      { kind: "revenue", amountCents: 55 },
      { kind: "expense", amountCents: 6000 },
    ]);
    expect(s).toEqual({ revenueCents: 12400, expenseCents: 6000, netCents: 6400, eventCount: 3 });
    expect(Number.isInteger(s.netCents)).toBe(true);
  });
  it("empty → all zero", () => {
    expect(reduceSummary([])).toEqual({
      revenueCents: 0,
      expenseCents: 0,
      netCents: 0,
      eventCount: 0,
    });
  });
});

describe("validation", () => {
  it("rejects zero and negative amounts", () => {
    expect(() => validateAmountCents(0)).toThrow();
    expect(() => validateAmountCents(-5)).toThrow();
    expect(() => validateAmountCents(1.5)).toThrow();
    expect(() => validateAmountCents(2500)).not.toThrow();
  });
  it("normalizes + validates currency", () => {
    expect(normalizeCurrency(undefined)).toBe("USD");
    expect(normalizeCurrency("eur")).toBe("EUR");
    expect(() => normalizeCurrency("US")).toThrow();
    expect(() => normalizeCurrency("dollars")).toThrow();
  });
});
