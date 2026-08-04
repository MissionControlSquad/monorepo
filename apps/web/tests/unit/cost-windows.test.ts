import { describe, it, expect } from "vitest";
import { COST_WINDOWS, summarizeCostWindows, type CostRow } from "@agentcenter/utils";

const NOW = new Date("2026-07-19T12:00:00Z");
function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("summarizeCostWindows (Domain 12 GAP-6 A10)", () => {
  it("buckets each row into every window it falls within", () => {
    const rows: CostRow[] = [
      { provider: "anthropic", amountCents: 100, occurredAt: ago(1 * HOUR) }, // in 5h,24h,7d
      { provider: "anthropic", amountCents: 50, occurredAt: ago(10 * HOUR) }, // in 24h,7d
      { provider: "anthropic", amountCents: 25, occurredAt: ago(3 * DAY) }, // in 7d only
    ];
    const out = summarizeCostWindows(rows, NOW);
    const byWindow = Object.fromEntries(out.map((r) => [r.window, r]));
    expect(byWindow["5h"]).toMatchObject({ amountCents: 100, eventCount: 1 });
    expect(byWindow["24h"]).toMatchObject({ amountCents: 150, eventCount: 2 });
    expect(byWindow["7d"]).toMatchObject({ amountCents: 175, eventCount: 3 });
  });

  it("separates providers and maps a null provider to 'unknown'", () => {
    const rows: CostRow[] = [
      { provider: "openai", amountCents: 200, occurredAt: ago(1 * HOUR) },
      { provider: null, amountCents: 30, occurredAt: ago(1 * HOUR) },
    ];
    const out = summarizeCostWindows(rows, NOW).filter((r) => r.window === "5h");
    const byProvider = Object.fromEntries(out.map((r) => [r.provider, r.amountCents]));
    expect(byProvider.openai).toBe(200);
    expect(byProvider.unknown).toBe(30);
  });

  it("excludes rows older than the longest window and future rows", () => {
    const rows: CostRow[] = [
      { provider: "x", amountCents: 999, occurredAt: ago(30 * DAY) }, // too old
      { provider: "x", amountCents: 888, occurredAt: new Date(NOW.getTime() + HOUR) }, // future
    ];
    expect(summarizeCostWindows(rows, NOW)).toEqual([]);
  });

  it("exposes the standard 5h/24h/7d window set", () => {
    expect(COST_WINDOWS.map((w) => w.key)).toEqual(["5h", "24h", "7d"]);
  });
});
